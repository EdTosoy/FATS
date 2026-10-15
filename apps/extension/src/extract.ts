import type { CapturedJob } from '@fats/domain';
export interface ExtractionResult {
  job: CapturedJob;
  method: 'structured' | 'semantic';
  warnings: string[];
}

// Injected as a function by chrome.scripting: all runtime helpers stay inside it.
export function extractJobPage(): ExtractionResult {
  if (!['text/html', 'application/xhtml+xml'].includes(document.contentType))
    throw new Error('UNSUPPORTED_PAGE');
  const warnings: string[] = [];
  function plain(value: unknown, limit = 20000): string {
    if (typeof value !== 'string') return '';
    const template = document.createElement('template');
    template.innerHTML = value.slice(0, 200000);
    template.content
      .querySelectorAll(
        'script,style,noscript,iframe,object,embed,link,img,svg',
      )
      .forEach((node) => node.remove());
    template.content
      .querySelectorAll('p,div,li,br')
      .forEach((node) => node.before(document.createTextNode('\n')));
    return (template.content.textContent ?? '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()
      .slice(0, limit);
  }
  function object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  function meta(name: string): string {
    return (
      document.querySelector<HTMLMetaElement>(
        `meta[property="${name}"],meta[name="${name}"]`,
      )?.content ?? ''
    );
  }
  function text(selector: string): string {
    return document.querySelector(selector)?.textContent ?? '';
  }
  const jobs: Record<string, unknown>[] = [];
  let visited = 0,
    total = 0;
  function visit(value: unknown, depth = 0): void {
    if (depth > 12 || ++visited > 2000) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item) => visit(item, depth + 1));
      return;
    }
    const row = object(value),
      type = row['@type'];
    if (
      type === 'JobPosting' ||
      (Array.isArray(type) && type.includes('JobPosting'))
    )
      jobs.push(row);
    if (row['@graph']) visit(row['@graph'], depth + 1);
    if (row.mainEntity) visit(row.mainEntity, depth + 1);
  }
  for (const script of [
    ...document.querySelectorAll('script[type="application/ld+json"]'),
  ].slice(0, 20)) {
    const raw = script.textContent ?? '';
    total += raw.length;
    if (raw.length > 200000 || total > 500000) {
      warnings.push('Some structured data was too large to inspect.');
      continue;
    }
    try {
      visit(JSON.parse(raw));
    } catch {
      warnings.push('Some structured data could not be read.');
    }
  }
  let posting = jobs.length === 1 ? jobs[0] : undefined;
  if (jobs.length > 1) {
    const matching = jobs.filter((job) => {
      try {
        const url = new URL(String(job.url), location.href);
        url.hash = '';
        const current = new URL(location.href);
        current.hash = '';
        return url.href === current.href;
      } catch {
        return false;
      }
    });
    if (matching.length === 1) posting = matching[0];
    else
      warnings.push(
        'Several jobs were found. Enter the details for one posting manually.',
      );
  }
  const semantic = !jobs.length;
  const addresses = posting
    ? Array.isArray(posting.jobLocation)
      ? posting.jobLocation
      : [posting.jobLocation]
    : [];
  const locations = addresses
    .map((entry) => {
      const address = object(object(entry).address);
      return [
        ...new Set(
          [
            address.addressLocality,
            address.addressRegion,
            typeof address.addressCountry === 'string'
              ? address.addressCountry
              : object(address.addressCountry).name,
          ]
            .map((value) => plain(value, 160))
            .filter(Boolean),
        ),
      ].join(', ');
    })
    .filter(Boolean);
  const arrangement =
    posting?.jobLocationType === 'TELECOMMUTE'
      ? 'Remote'
      : plain(
          meta('job:work_arrangement') || text('[data-work-arrangement]'),
          80,
        );
  const job: CapturedJob = {
    title: plain(
      posting?.title ??
        (semantic
          ? text('[itemprop="title"], main h1, article h1') || meta('og:title')
          : ''),
      160,
    ),
    company: plain(
      posting
        ? object(posting.hiringOrganization).name
        : semantic
          ? text(
              '[itemprop="hiringOrganization"] [itemprop="name"], [data-company]',
            ) || meta('job:company')
          : '',
      160,
    ),
    location: plain(
      locations.join('; ') ||
        (semantic
          ? text('[itemprop="jobLocation"], [data-job-location]') ||
            meta('job:location')
          : ''),
      160,
    ),
    workArrangement: jobs.length > 1 && !posting ? '' : arrangement,
    description: plain(
      posting?.description ??
        (semantic
          ? text(
              '[itemprop="description"], [data-job-description], main article',
            ) ||
            meta('description') ||
            meta('og:description')
          : ''),
    ),
    sourceUrl: location.href.length <= 2048 ? location.href : '',
  };
  if (!job.sourceUrl)
    warnings.push(
      'The page URL is too long. Paste a shorter original posting link.',
    );
  if (!job.title && !job.company && !job.description)
    warnings.push(
      'No reliable job details were found. Paste or type them below.',
    );
  else if (
    !job.title ||
    !job.company ||
    (!job.location && !job.workArrangement)
  )
    warnings.push('Some details are missing. Fill them in before reviewing.');
  return {
    job,
    method: posting ? 'structured' : 'semantic',
    warnings: [...new Set(warnings)],
  };
}
