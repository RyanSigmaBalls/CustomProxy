const historyContainer = document.querySelector('#history-table');

async function loadHistory() {
  if (!historyContainer) return;
  try {
    const response = await fetch('/api/history');
    const data = await response.json();
    historyContainer.innerHTML = data.history.length
      ? `<table>
          <thead><tr><th>URL</th><th>Title</th><th>Status</th><th>Visited</th></tr></thead>
          <tbody>${data.history
            .map(
              (item) => `
                <tr>
                  <td><a href="/proxy?target=${encodeURIComponent(item.targetUrl)}" target="_self">${item.targetUrl}</a></td>
                  <td>${item.pageTitle || 'N/A'}</td>
                  <td>${item.statusCode}</td>
                  <td>${new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              `
            )
            .join('')}</tbody>
        </table>`
      : '<p class="muted-text">No history available yet.</p>';
  } catch (error) {
    historyContainer.textContent = 'Unable to load history.';
    console.error(error);
  }
}

loadHistory();
