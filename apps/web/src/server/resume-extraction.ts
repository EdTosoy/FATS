import { Worker } from 'node:worker_threads';
import { MAX_DOCUMENT_BYTES, type DocumentFormat } from '@fats/domain';
import {
  DocumentWorkerLimit,
  finishDocumentWorker,
  runDocumentWorker,
} from './document-worker';
export type ExtractionResult =
  | {
      status: 'success';
      lines: { text: string; location: string }[];
      warnings: string[];
    }
  | { status: 'empty' | 'unsupported' | 'failed' | 'limit'; message: string };
export async function extractResume(
  bytes: Uint8Array,
  format: DocumentFormat,
): Promise<ExtractionResult> {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES)
    return {
      status: 'limit',
      message: 'The resume must be a nonempty file of at most 10 MiB.',
    };
  if (format === 'docx') {
    try {
      return await runDocumentWorker<ExtractionResult>(bytes, 'extract');
    } catch {
      return {
        status: 'limit',
        message:
          'This DOCX could not be extracted safely within the processing limits. Use a simpler text-based resume.',
      };
    }
  }
  if (format !== 'pdf')
    return {
      status: 'unsupported',
      message: 'Only PDF and DOCX resumes can be compared.',
    };
  const worker = new Worker(
    `
      const {parentPort,workerData}=require('node:worker_threads');
      const path=require('node:path'),{pathToFileURL}=require('node:url');
      const nativeRequire=require('node:module').createRequire(path.join(workerData.root,'package.json'));
      (async()=>{try {
        const modulePath=nativeRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs',{paths:[workerData.root,path.join(workerData.root,'apps/web')]});
        const {getDocument,OPS}=await import(pathToFileURL(modulePath).href);
        const task=getDocument({data:new Uint8Array(workerData.bytes),enableXfa:false,useSystemFonts:true,disableFontFace:true,useWasm:false,useWorkerFetch:false,stopAtErrors:true,verbosity:0,maxImageSize:1000000});
        const pdf=await task.promise;
        if(pdf.numPages>30){parentPort.postMessage({status:'limit',message:'Compare a resume of at most 30 pages.'});return;}
        const lines=[];let total=0,images=false;
        for(let number=1;number<=pdf.numPages;number++) {
          const page=await pdf.getPage(number),content=await page.getTextContent(),previousLines=lines.length;let line='',lineNumber=1;
          for(const item of content.items)if('str' in item){line+=item.str+' ';if(item.hasEOL){if(line.trim())lines.push({text:line,location:'Page '+number+', line '+lineNumber});line='';lineNumber++;}total+=item.str.length;if(total>24000||lines.length>200){parentPort.postMessage({status:'limit',message:'The extracted resume exceeds 24,000 characters or 200 text segments. Use a shorter resume.'});return;}}
          if(line.trim())lines.push({text:line,location:'Page '+number+', line '+lineNumber});
          if(lines.length===previousLines){const ops=await page.getOperatorList();images ||= ops.fnArray.some(op=>[OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject].includes(op));}
          page.cleanup();
        }
        await task.destroy();
        if(images){parentPort.postMessage({status:'unsupported',message:'This PDF contains an image-only page that cannot be read reliably. Use a fully text-based PDF or DOCX; OCR is not included.'});return;}
        parentPort.postMessage(lines.length?{status:'success',lines,warnings:['PDF reading order may differ from the page layout. Image text and scanned pages are not read; OCR is not included. Review every extracted segment.']}:{status:images?'unsupported':'empty',message:images?'This PDF appears to be image-only. Use a text-based PDF or DOCX; OCR is not included.':'This PDF contains no readable text.'});
      }catch{parentPort.postMessage({status:'failed',message:'This PDF could not be extracted safely. Try a text-based PDF or DOCX.'});}})();
    `,
    {
      eval: true,
      workerData: { root: process.cwd(), bytes },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
      stdout: true,
      stderr: true,
    },
  );
  try {
    return await finishDocumentWorker<ExtractionResult>(worker, 10000);
  } catch (error) {
    return {
      status: error instanceof DocumentWorkerLimit ? 'limit' : 'failed',
      message:
        'Resume extraction failed or reached its processing limit. Use a simpler text-based document.',
    };
  }
}
