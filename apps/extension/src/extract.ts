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
    const node = document.querySelector(selector);
    return (
      node?.getAttribute('content') ||
      node?.getAttribute('datetime') ||
      node?.textContent ||
      ''
    );
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
  // Read explicit facts only: no salary parsing from prose, inferred seniority,
  // currency defaults, or classifying generic skills as technologies.
  function explicit(
    property: string,
    selector: string,
    metadata: string,
  ): unknown {
    return posting
      ? posting[property]
      : semantic
        ? text(selector) || meta(metadata)
        : '';
  }
  function texts(value: unknown): string {
    return (Array.isArray(value) ? value.slice(0, 100) : [value])
      .map((entry) =>
        plain(typeof entry === 'string' ? entry : object(entry).name),
      )
      .filter(Boolean)
      .join('\n')
      .slice(0, 20000);
  }
  function amount(value: unknown): number | null {
    if (
      semantic &&
      typeof value === 'string' &&
      /^\d+(?:\.\d+)?$/.test(value.trim())
    )
      value = Number(value);
    return typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1e12
      ? value
      : null;
  }
  const salary = object(posting?.baseSalary);
  const salaryValue = object(salary.value);
  const fixedSalary =
    typeof posting?.baseSalary === 'number'
      ? posting.baseSalary
      : typeof salary.value === 'number'
        ? salary.value
        : salaryValue.value;
  let salaryMin = amount(
    posting
      ? (salaryValue.minValue ?? fixedSalary)
      : explicit('', '[data-salary-min]', 'job:salary_min'),
  );
  let salaryMax = amount(
    posting
      ? (salaryValue.maxValue ?? fixedSalary)
      : explicit('', '[data-salary-max]', 'job:salary_max'),
  );
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    salaryMin = salaryMax = null;
    warnings.push('The salary range is inconsistent. Enter it manually.');
  }
  const currency = plain(
    posting
      ? salary.currency
      : explicit('', '[data-salary-currency]', 'job:salary_currency'),
    20,
  );
  const period = plain(
    posting
      ? salaryValue.unitText
      : explicit('', '[data-payment-period]', 'job:payment_period'),
    20,
  ).toLowerCase();
  const date = plain(
    explicit(
      'datePosted',
      '[itemprop="datePosted"], [data-posting-date]',
      'job:date_posted',
    ),
    80,
  );
  const datePart = date.slice(0, 10);
  const postingDate =
    /^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$)/.test(
      date,
    ) &&
    Number.isFinite(Date.parse(date)) &&
    Number.isFinite(Date.parse(datePart)) &&
    new Date(datePart).toISOString().slice(0, 10) === datePart
      ? datePart
      : '';
  const job: CapturedJob = {
    salaryMin,
    salaryMax,
    currency: /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : '',
    paymentPeriod: ['hour', 'day', 'week', 'month', 'year'].includes(period)
      ? (period as CapturedJob['paymentPeriod'])
      : '',
    seniority: texts(
      explicit('seniority', '[data-seniority]', 'job:seniority'),
    ),
    technologies: texts(
      explicit('technologies', '[data-technologies]', 'job:technologies'),
    ),
    qualifications: posting
      ? [
          posting.qualifications,
          posting.educationRequirements,
          posting.experienceRequirements,
        ]
          .map(texts)
          .filter(Boolean)
          .join('\n')
          .slice(0, 20000)
      : texts(
          explicit(
            '',
            '[itemprop="qualifications"], [data-qualifications]',
            'job:qualifications',
          ),
        ),
    postingDate,
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
