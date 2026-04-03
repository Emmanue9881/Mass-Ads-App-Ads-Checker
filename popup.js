/**
 * @typedef {Object} ScanResult
 * @property {string} domain Original user input domain string.
 * @property {"Valid"|"Empty File"|"Error"} status Human-readable scan status.
 * @property {number} lines Count of valid DIRECT/RESELLER records.
 * @property {string} url Resolved URL used for the result, or "-" when unresolved.
 * @property {"valid"|"empty"|"error"} cssClass CSS status class used in table rendering.
 */

function initPopup() {
  const checkBtn = document.getElementById('checkBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const domainInput = document.getElementById('domainList');
  const fileTypeSelect = document.getElementById('fileTypeSelect');
  const tableBody = document.querySelector('#resultsTable tbody');
  const statusText = document.getElementById('statusText');
  const progressText = document.getElementById('progressText');
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  let results = [];
  let currentTheme = localStorage.getItem('theme') || 'light';
  
  applyTheme(currentTheme);
  updateThemeBtnText(currentTheme);

  function updateThemeBtnText(theme) {
    themeToggleBtn.innerText = theme === 'light' ? 'Dark Theme' : 'Light Theme';
  }

  function handleThemeToggle() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
    updateThemeBtnText(currentTheme);
  }

  async function handleCheckClick() {
    const text = domainInput.value;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const fileType = fileTypeSelect.value;

    if (lines.length === 0) {
      statusText.innerText = 'List is empty!';
      return;
    }

    results = [];
    tableBody.innerHTML = '';
    checkBtn.disabled = true;
    checkBtn.innerText = 'Processing...';
    downloadBtn.style.display = 'none';

    let completed = 0;
    progressText.innerText = `0/${lines.length}`;

    // Увеличен размер пачки для максимальной утилизации сети браузера
    const batchSize = 15;

    for (let i = 0; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(domain => checkDomainSmart(domain, fileType)));

      batchResults.forEach(res => {
        addResultToTable(res, tableBody);
        results.push(res);
        completed++;
      });

      progressText.innerText = `${completed}/${lines.length}`;
    }

    statusText.innerText = 'Completed!';
    checkBtn.disabled = false;
    checkBtn.innerText = 'Run Check';
    downloadBtn.style.display = 'block';
  }

  function handleDownloadClick() {
    let csv = 'File URL,Status,Lines\n';
    results.forEach(r => {
      const urlForCsv = r.url !== '-' ? r.url : r.domain;
      csv += `${urlForCsv},${r.status},${r.lines}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'checker_results.csv';
    a.click();
  }

  themeToggleBtn.addEventListener('click', handleThemeToggle);
  checkBtn.addEventListener('click', handleCheckClick);
  downloadBtn.addEventListener('click', handleDownloadClick);
}

async function checkDomainSmart(rawDomain, fileType) {
  let urls = [];

  if (fileType === 'url') {
    const exactUrl = /^(https?:\/\/)/i.test(rawDomain) ? rawDomain : `https://${rawDomain}`;
    urls = [exactUrl];
  } else {
    const domain = rawDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').split('/')[0];
    urls = [
      `https://${domain}/${fileType}`,
      `https://www.${domain}/${fileType}`,
      `http://${domain}/${fileType}`,
      `http://www.${domain}/${fileType}`
    ];
  }

  const fetchUrl = async (url) => {
    const controller = new AbortController();
    // Таймаут снижен до 7 секунд, чтобы не тормозить общую очередь
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeoutId);

      if (response.status === 200) {
        const text = await response.text();

        // Защита от Soft 404
        if (text.toLowerCase().includes('<html') || text.toLowerCase().includes('<!doctype')) {
          throw new Error("HTML content");
        }

        const validLines = countValidLines(text);
        return {
          domain: rawDomain,
          status: validLines > 0 ? 'Valid' : 'Empty File',
          lines: validLines,
          url: url,
          cssClass: validLines > 0 ? 'valid' : 'empty'
        };
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  };

  try {
    // Promise.any параллельно запускает все 4 запроса для домена
    // Первый успешный возвращает результат, остальные прерываются или игнорируются
    return await Promise.any(urls.map(url => fetchUrl(url)));
  } catch (aggregateError) {
    return {
      domain: rawDomain,
      status: 'Error',
      lines: 0,
      url: '-',
      cssClass: 'error'
    };
  }
}

function countValidLines(content) {
  let count = 0;
  const cleanContent = content.replace(/\uFEFF/g, '');
  const lines = cleanContent.split(/\r?\n/);

  for (const line of lines) {
    const clean = line.split('#')[0].trim();
    if (!clean) continue;

    const parts = clean.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      const type = parts[2].toUpperCase().replace(/[^A-Z]/g, '');
      if (type === 'DIRECT' || type === 'RESELLER') {
        count++;
      }
    }
  }

  return count;
}

function addResultToTable(res, tableBody) {
  const tr = document.createElement('tr');
  const urlCell = res.url !== '-'
    ? `<a href="${res.url}" target="_blank">${res.url}</a>`
    : `<span style="color:#999">${res.domain}</span>`;

  tr.innerHTML = `
    <td class="col-url">${urlCell}</td>
    <td class="col-status ${res.cssClass}">${res.status}</td>
    <td class="col-lines">${res.lines}</td>
  `;
  tableBody.appendChild(tr);
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
}

document.addEventListener('DOMContentLoaded', initPopup);