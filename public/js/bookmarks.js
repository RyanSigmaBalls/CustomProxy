const bookmarkForm = document.querySelector('#bookmark-form');
const bookmarkTable = document.querySelector('#bookmark-table');

async function loadBookmarks() {
  if (!bookmarkTable) return;
  try {
    const response = await fetch('/api/bookmarks');
    const data = await response.json();
    bookmarkTable.innerHTML = data.bookmarks.length
      ? `<table>
          <thead><tr><th>Title</th><th>URL</th><th>Notes</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>${data.bookmarks
            .map(
              (item) => `
                <tr>
                  <td>${item.title}</td>
                  <td><a href="/proxy?target=${encodeURIComponent(item.url)}">Open</a></td>
                  <td>${item.notes || '—'}</td>
                  <td>${new Date(item.createdAt).toLocaleString()}</td>
                  <td><button class="secondary-btn delete-bookmark" data-id="${item.id}">Delete</button></td>
                </tr>
              `
            )
            .join('')}</tbody>
        </table>`
      : '<p class="muted-text">No bookmarks yet.</p>';

    bookmarkTable.querySelectorAll('.delete-bookmark').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.id;
        await fetch('/api/bookmarks/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        loadBookmarks();
      });
    });
  } catch (error) {
    bookmarkTable.textContent = 'Unable to load bookmarks.';
    console.error(error);
  }
}

if (bookmarkForm) {
  bookmarkForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = document.querySelector('#bookmark-title').value.trim();
    const url = document.querySelector('#bookmark-url').value.trim();
    const notes = document.querySelector('#bookmark-notes').value.trim();
    if (!title || !url) return;
    await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, url, notes }),
    });
    bookmarkForm.reset();
    loadBookmarks();
  });
}

loadBookmarks();
