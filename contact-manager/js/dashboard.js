// Same-origin API base. Because it's same-origin, a leading "/LAMPAPI"
// resolves against whatever host is serving the page — no CORS needed.
const urlBase = 'http://contactmanager7.xyz/LAMPAPI';
const extension = 'php';

// Where to send the user when they're not logged in / when they log out.
const loginPage = 'index.html';

// Contacts must match this phone shape: ###-###-####.
const PHONE_PATTERN = /^\d{3}-\d{3}-\d{4}$/;

// Server-side page size. SearchContacts.php hardcodes LIMIT 20, so this is the
// number of records one page request returns. Keep it in sync with the backend.
const PAGE_LIMIT = 20;

// The backend returns this exact string (not an empty list) when a page has no
// rows. On page 1 that's "no matches"; on a later page it's "end of data".
const NO_RECORDS_ERROR = 'No Records Found';

// Logged-in user, hydrated from localStorage on load by readSession().
// Grouped behind one binding so the (reassigned) fields live on a const object
// instead of polluting the shared global scope with bare `firstName`/`lastName`.
const session = {
  userId: 0,
  firstName: '',
  lastName: '',
};

const redirectToLogin = () => {
  window.location.href = loginPage;
};

// ===========================================================================
//  SESSION  — read the logged-in user that Login.js stored in localStorage.
// ===========================================================================

/**
 * Hydrates `session` from localStorage. Redirects to the login page when no
 * valid userId is stored; otherwise greets the user by first name.
 * @returns {void}
 */
function readSession() {
  const stored = localStorage.getItem('userId');
  session.userId = stored ? parseInt(stored, 10) : -1;
  session.firstName = localStorage.getItem('firstName') || '';
  session.lastName = localStorage.getItem('lastName') || '';

  if (!session.userId || session.userId < 1 || Number.isNaN(session.userId)) {
    redirectToLogin();
    return;
  }

  const nameSpan = document.querySelector('.user-name');
  if (nameSpan && session.firstName) {
    nameSpan.textContent = session.firstName;
  }
}

/**
 * Clears the stored session and returns to the login page.
 * @returns {void}
 */
function doLogout() {
  session.userId = 0;
  session.firstName = '';
  session.lastName = '';
  ['userId', 'firstName', 'lastName'].forEach((key) => localStorage.removeItem(key));
  redirectToLogin();
}

// ===========================================================================
//  SHARED HELPER  — one place that does the JSON POST + parse. Resolves with
//  the parsed object on a 200 reply, or throws an Error otherwise.
// ===========================================================================

/**
 * Sends a JSON POST to a LAMPAPI endpoint and returns the parsed response.
 * @param {string} endpoint - Endpoint name without extension (e.g. 'SearchContacts').
 * @param {Object} payload - Object serialised as the JSON request body.
 * @returns {Promise<Object>} Parsed JSON response (empty object if the body is empty).
 * @throws {Error} If the request fails or the response body is not valid JSON.
 */
async function apiPost(endpoint, payload) {
  const url = `${urlBase}/${endpoint}.${extension}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed (HTTP ${response.status}).`);
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Bad response from server: ${err.message}`);
  }
}

// ===========================================================================
//  SHARED INPUT / VALIDATION HELPERS
// ===========================================================================

/**
 * Reads and trims the value of a text input by element id.
 * @param {string} id - The element id.
 * @returns {string} The trimmed value.
 */
const readInput = (id) => document.getElementById(id).value.trim();

/**
 * Validates the four contact fields.
 * @param {{firstName: string, lastName: string, email: string, phone: string}} fields
 * @returns {string} An error message, or '' when the fields are valid.
 */
function validateContactFields({ firstName, lastName, email, phone }) {
  if (!firstName || !lastName || !email || !phone) {
    return 'Please fill in first name, last name, email, and phone.';
  }
  if (!PHONE_PATTERN.test(phone)) {
    return 'Phone must be in the format ###-###-#### (e.g. 407-555-1234).';
  }
  return '';
}

// ===========================================================================
//  SEARCH (READ)  — paginated "Load More" strategy.
// ===========================================================================

// The <select> value -> the API search key. The API's search object uses
// firstName / lastName / email / phone, so we map the dropdown to those.
const FIELD_TO_KEY = {
  first_name: 'firstName',
  last_name: 'lastName',
  email: 'email',
  number: 'phone',
};

const FIELD_LABELS = {
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  number: 'Number',
};

// Single source of truth for the active search. `currentPage` starts at 1 and
// is bumped by Load More. `token` is a sequence number: a fresh search bumps it
// so any still-in-flight request from a previous search/page is discarded when
// it returns (prevents stale results racing in out of order).
const searchState = {
  term: '',
  field: 'first_name',
  key: 'firstName',
  currentPage: 1,
  isFetchingMore: false,
  token: 0,
};

/**
 * Runs a brand-new search: resets to page 1, clears the list and the button,
 * then fetches and renders the first page.
 * @returns {Promise<void>}
 */
async function searchContacts() {
  const field = document.getElementById('search-field').value;
  Object.assign(searchState, {
    term: readInput('contact-search'),
    field,
    key: FIELD_TO_KEY[field] || 'firstName',
    currentPage: 1,
    isFetchingMore: false,
    token: searchState.token + 1, // invalidate anything already in flight
  });

  await fetchPage({ append: false, token: searchState.token });
}

/**
 * Fetches the next page and appends it to the existing list. Guarded so rapid
 * clicks can't fire overlapping requests.
 * @returns {Promise<void>}
 */
async function loadMore() {
  if (searchState.isFetchingMore) {
    return;
  }
  searchState.isFetchingMore = true;
  searchState.currentPage += 1;

  await fetchPage({ append: true, token: searchState.token });
}

/**
 * Core fetch used by both initial search and Load More.
 * @param {{append: boolean, token: number}} options
 *   append - true to add to the list, false to replace it (page 1).
 *   token  - the searchState.token at dispatch time, used to detect supersession.
 * @returns {Promise<void>}
 */
async function fetchPage({ append, token }) {
  const { term, key, field, currentPage } = searchState;
  const search = term ? { [key]: term } : {};

  clearLoadMoreStatus();
  setLoadMoreLoading(true);

  try {
    const data = await apiPost('SearchContacts', {
      userId: session.userId,
      search,
      page: currentPage,
    });

    // A newer search started while we were waiting — drop this response.
    if (token !== searchState.token) {
      return;
    }

    const results = data.results || [];
    const apiError = data.error || '';

    // A genuine backend error (not the empty-page sentinel).
    if (apiError && apiError !== NO_RECORDS_ERROR) {
      if (append) {
        searchState.currentPage -= 1; // this page didn't load; allow a retry
        setLoadMoreStatus(apiError);
        toggleLoadMore(true);
      } else {
        renderResults([], { term, field, error: apiError });
        toggleLoadMore(false);
      }
      return;
    }

    // From here, apiError is either '' or NO_RECORDS_ERROR (treated as "no more").
    if (append) {
      if (apiError === NO_RECORDS_ERROR) {
        // We asked for a page past the end (total was an exact multiple of 20).
        searchState.currentPage -= 1;
      } else {
        appendResults(results);
      }
    } else {
      // Page 1: NO_RECORDS_ERROR becomes a friendly empty state ('' error).
      renderResults(results, { term, field, error: '' });
    }

    // Fewer than a full page (or the end sentinel) => nothing left to fetch.
    const hasMore = apiError !== NO_RECORDS_ERROR && results.length === PAGE_LIMIT;
    toggleLoadMore(hasMore);
  } catch (err) {
    if (token !== searchState.token) {
      return;
    }
    if (append) {
      searchState.currentPage -= 1; // roll back so the retry refetches this page
      setLoadMoreStatus(`Couldn't load more: ${err.message}`);
      toggleLoadMore(true);
    } else {
      renderResults([], { term, field, error: err.message });
      toggleLoadMore(false);
    }
  } finally {
    if (token === searchState.token) {
      searchState.isFetchingMore = false;
      setLoadMoreLoading(false);
    }
  }
}

/**
 * Builds the "N results for ..." summary line. With Load More this reflects how
 * many are currently loaded, not a grand total (the API doesn't return one).
 * @param {number} count
 * @param {string} term
 * @param {string} field
 * @returns {string}
 */
function buildCountLabel(count, term, field) {
  const noun = count === 1 ? 'result' : 'results';
  const label = FIELD_LABELS[field] || field;
  const scope = term ? ` for "${term}" in ${label}` : '';
  return `${count} ${noun}${scope}`;
}

/** Recomputes the count line from the number of cards currently rendered. */
function refreshCountLabel() {
  const count = document.getElementById('contact-count');
  const shown = document.querySelectorAll('#contact-list .contact-card').length;
  count.textContent = buildCountLabel(shown, searchState.term, searchState.field);
}

/**
 * Creates a single keyboard-accessible contact card list item.
 * @param {{id: (number|string), firstName: string, lastName: string, email: string, phone: string}} contact
 * @returns {HTMLLIElement}
 */
function createContactCard(contact) {
  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  const detail = contact.phone || contact.email || '';

  const li = document.createElement('li');
  li.className = 'contact-card';
  li.dataset.id = contact.id;
  li.tabIndex = 0; // keyboard-focusable
  li.setAttribute('role', 'button');
  li.innerHTML = `
    <div class="contact-info">
      <h3 class="contact-name"></h3>
      <p class="contact-detail"></p>
    </div>`;

  // textContent (not innerHTML) so a contact's data can't inject markup.
  li.querySelector('.contact-name').textContent = fullName;
  li.querySelector('.contact-detail').textContent = detail;

  // Clicking (or Enter/Space on) the card opens the edit/delete popup.
  const open = () => openContactModal(contact);
  li.addEventListener('click', open);
  li.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  return li;
}

/**
 * Replaces the list with a fresh page-1 render (clears previous results first).
 * @param {Array<Object>} results - Contacts to render.
 * @param {{term: string, field: string, error: string}} context - Display context.
 * @returns {void}
 */
function renderResults(results, { term, field, error }) {
  const title = document.getElementById('widget-title');
  const count = document.getElementById('contact-count');
  const emptyState = document.getElementById('empty-state');
  const list = document.getElementById('contact-list');

  title.textContent = 'Search results';
  count.textContent = error || buildCountLabel(results.length, term, field);

  emptyState.hidden = true;
  list.hidden = false;
  list.replaceChildren();

  if (results.length === 0) {
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = error ? '' : 'No contacts matched your search.';
    list.appendChild(li);
    return;
  }

  results.forEach((contact) => list.appendChild(createContactCard(contact)));
}

/**
 * Appends a page of contacts to the existing list (Load More) and updates the
 * count line to reflect the new total shown.
 * @param {Array<Object>} results
 * @returns {void}
 */
function appendResults(results) {
  const list = document.getElementById('contact-list');
  results.forEach((contact) => list.appendChild(createContactCard(contact)));
  refreshCountLabel();
}

// ===========================================================================
//  LOAD-MORE BUTTON  — created lazily after the list, then toggled.
// ===========================================================================

/**
 * Returns the Load More button, creating it (hidden) just after the contact
 * list if it isn't already in the markup. The click handler is attached once
 * during wire-up, so this never double-binds.
 * @returns {?HTMLButtonElement}
 */
function ensureLoadMoreButton() {
  const existing = document.getElementById('load-more-btn');
  if (existing) {
    return existing;
  }

  const list = document.getElementById('contact-list');
  if (!list) {
    return null;
  }

  const btn = document.createElement('button');
  btn.id = 'load-more-btn';
  btn.type = 'button';
  btn.className = 'load-more-btn';
  btn.textContent = 'Load More';
  btn.hidden = true;
  list.insertAdjacentElement('afterend', btn);
  return btn;
}

/**
 * Shows or hides the Load More button.
 * @param {boolean} show
 * @returns {void}
 */
function toggleLoadMore(show) {
  const btn = ensureLoadMoreButton();
  if (btn) {
    btn.hidden = !show;
  }
}

/**
 * Reflects the in-flight state on the button (disabled + label) without
 * changing its visibility.
 * @param {boolean} isLoading
 * @returns {void}
 */
function setLoadMoreLoading(isLoading) {
  const btn = ensureLoadMoreButton();
  if (!btn) {
    return;
  }
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Loading…' : 'Load More';
}

/**
 * Shows a small status message under the button (used for Load More failures).
 * @param {string} message
 * @returns {void}
 */
function setLoadMoreStatus(message) {
  const btn = ensureLoadMoreButton();
  if (!btn) {
    return;
  }
  let status = document.getElementById('load-more-status');
  if (!status) {
    status = document.createElement('p');
    status.id = 'load-more-status';
    status.className = 'load-more-status';
    btn.insertAdjacentElement('afterend', status);
  }
  status.textContent = message;
  status.hidden = false;
}

/** Hides the Load More status message. @returns {void} */
function clearLoadMoreStatus() {
  const status = document.getElementById('load-more-status');
  if (status) {
    status.hidden = true;
  }
}

// ===========================================================================
//  ADD (CREATE)
// ===========================================================================

/** Clears the four add-contact inputs. @returns {void} */
function clearAddForm() {
  ['add-first-name', 'add-last-name', 'add-email', 'add-phone'].forEach((id) => {
    document.getElementById(id).value = '';
  });
}

/** Hides the empty-state prompt card if present. @returns {void} */
function hideEmptyState() {
  const emptyCard = document.getElementById('empty-state');
  if (emptyCard) {
    emptyCard.hidden = true;
  }
}

/**
 * Validates the add-contact form and creates the contact via the API.
 * @returns {Promise<void>}
 */
async function addContact() {
  const resultSpan = document.getElementById('add-contact-result');
  resultSpan.textContent = '';

  const fields = {
    firstName: readInput('add-first-name'),
    lastName: readInput('add-last-name'),
    email: readInput('add-email'),
    phone: readInput('add-phone'),
  };

  const validationError = validateContactFields(fields);
  if (validationError) {
    resultSpan.textContent = validationError;
    return;
  }

  try {
    const data = await apiPost('AddContact', { userId: session.userId, ...fields });
    if (data.error) {
      resultSpan.textContent = data.error;
      return;
    }
    resultSpan.textContent = 'Contact added.';
    hideEmptyState();
    clearAddForm();
    // Close the popup shortly after, so the user sees the confirmation.
    setTimeout(closeAddModal, 800);
  } catch (err) {
    resultSpan.textContent = err.message;
  }
}

// ===========================================================================
//  ADD-CONTACT MODAL  — open/close the popup. No page refresh involved.
// ===========================================================================

/** Opens the add-contact modal and focuses the first field. @returns {void} */
function openAddModal() {
  const modal = document.getElementById('add-contact-modal');
  if (!modal) {
    return;
  }
  document.getElementById('add-contact-result').textContent = '';
  modal.hidden = false;
  document.getElementById('add-first-name')?.focus();
}

/** Closes the add-contact modal. @returns {void} */
function closeAddModal() {
  const modal = document.getElementById('add-contact-modal');
  if (modal) {
    modal.hidden = true;
  }
}

// ===========================================================================
//  EDIT (UPDATE) / DELETE  — thin API wrappers used by the contact popup.
// ===========================================================================

/**
 * Updates an existing contact.
 * @param {(number|string)} contactId
 * @param {{firstName: string, lastName: string, email: string, phone: string}} fields
 * @returns {Promise<Object>} Parsed API response.
 */
function editContact(contactId, fields) {
  return apiPost('EditContact', { userId: session.userId, contactId, ...fields });
}

/**
 * Deletes a contact.
 * @param {(number|string)} contactId
 * @returns {Promise<Object>} Parsed API response.
 */
function deleteContact(contactId) {
  return apiPost('DeleteContact', { userId: session.userId, contactId });
}

// ===========================================================================
//  CONTACT MODAL (EDIT / DELETE)  — opens when a search result is clicked.
//  Fields are pre-filled and editable. Edit (bottom right) saves; Delete
//  (bottom left) asks for confirmation, then removes the contact. No refresh.
// ===========================================================================

// The contact currently open in the popup.
let activeContact = null;

/**
 * Opens the edit/delete popup, pre-filled with the contact's details.
 * @param {Object} contact
 * @returns {void}
 */
function openContactModal(contact) {
  activeContact = contact;

  document.getElementById('edit-first-name').value = contact.firstName || '';
  document.getElementById('edit-last-name').value = contact.lastName || '';
  document.getElementById('edit-email').value = contact.email || '';
  document.getElementById('edit-phone').value = contact.phone || '';
  document.getElementById('edit-contact-result').textContent = '';

  // Always start on the normal action row, not the confirm row.
  showEditActions();
  document.getElementById('contact-modal').hidden = false;
}

/** Closes the contact popup and clears the active contact. @returns {void} */
function closeContactModal() {
  const modal = document.getElementById('contact-modal');
  if (modal) {
    modal.hidden = true;
  }
  activeContact = null;
}

/** Shows the normal Delete/Edit action row. @returns {void} */
function showEditActions() {
  document.getElementById('contact-actions').hidden = false;
  document.getElementById('contact-confirm-delete').hidden = true;
}

/** Shows the "Are you sure?" confirmation row. @returns {void} */
function showDeleteConfirm() {
  document.getElementById('contact-actions').hidden = true;
  document.getElementById('contact-confirm-delete').hidden = false;
}

/**
 * Validates the popup fields and saves the edit. On success, re-runs the
 * search from page 1 so the visible list reflects the change.
 * @returns {Promise<void>}
 */
async function saveContactEdit() {
  if (!activeContact) {
    return;
  }
  const resultSpan = document.getElementById('edit-contact-result');
  resultSpan.textContent = '';

  const fields = {
    firstName: readInput('edit-first-name'),
    lastName: readInput('edit-last-name'),
    email: readInput('edit-email'),
    phone: readInput('edit-phone'),
  };

  const validationError = validateContactFields(fields);
  if (validationError) {
    resultSpan.textContent = validationError;
    return;
  }

  try {
    const data = await editContact(activeContact.id, fields);
    if (data.error) {
      resultSpan.textContent = data.error;
      return;
    }
    resultSpan.textContent = 'Changes saved.';
    setTimeout(() => {
      closeContactModal();
      searchContacts(); // refresh from page 1 to show the update
    }, 800);
  } catch (err) {
    resultSpan.textContent = err.message;
  }
}

/**
 * Confirms and performs the delete after the user clicks "Yes".
 * @returns {Promise<void>}
 */
async function confirmDeleteContact() {
  if (!activeContact) {
    return;
  }
  const resultSpan = document.getElementById('edit-contact-result');

  try {
    const data = await deleteContact(activeContact.id);
    if (data.error) {
      resultSpan.textContent = data.error;
      showEditActions(); // back to normal row so they can retry
      return;
    }
    closeContactModal();
    searchContacts(); // refresh from page 1; the contact is gone
  } catch (err) {
    resultSpan.textContent = err.message;
    showEditActions();
  }
}

// ===========================================================================
//  WIRE-UP  — connect DOM elements to the functions once the page loads.
// ===========================================================================

/**
 * Adds a listener only when the element exists, keeping the wire-up flat.
 * @param {?Element} element
 * @param {string} type
 * @param {EventListener} handler
 * @returns {void}
 */
function on(element, type, handler) {
  if (element) {
    element.addEventListener(type, handler);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  readSession(); // login guard + greeting

  // Load More button: create it (hidden) if the markup doesn't already have one,
  // and bind its click exactly once.
  on(ensureLoadMoreButton(), 'click', loadMore);

  // Search form: intercept submit so it doesn't navigate away.
  on(document.querySelector('.search-container form'), 'submit', (event) => {
    event.preventDefault();
    searchContacts();
  });

  // Logout link in the sidebar.
  on(document.querySelector('.logout-link'), 'click', (event) => {
    event.preventDefault();
    doLogout();
  });

  // Add-contact form submit -> AJAX, no refresh.
  on(document.getElementById('add-contact-form'), 'submit', (event) => {
    event.preventDefault();
    addContact();
  });

  // The empty-state "Add your first contact" button opens the modal.
  on(document.getElementById('add-first-contact-btn'), 'click', openAddModal);

  // The sidebar "Add Contact" link opens the modal too.
  on(document.querySelector('a[href="#add-contact"]'), 'click', (event) => {
    event.preventDefault();
    openAddModal();
  });

  // Close: the X button, clicking the dark backdrop, or pressing Escape.
  on(document.getElementById('add-modal-close'), 'click', closeAddModal);

  const addModal = document.getElementById('add-contact-modal');
  on(addModal, 'click', (event) => {
    // Only close when the backdrop itself is clicked, not the box.
    if (event.target === addModal) {
      closeAddModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAddModal();
      closeContactModal();
    }
  });

  // ---- Contact popup (edit / delete) ----
  on(document.getElementById('contact-edit-btn'), 'click', saveContactEdit);
  on(document.getElementById('contact-delete-btn'), 'click', showDeleteConfirm);
  on(document.getElementById('confirm-delete-yes'), 'click', confirmDeleteContact);
  on(document.getElementById('confirm-delete-no'), 'click', showEditActions);
  on(document.getElementById('contact-modal-close'), 'click', closeContactModal);

  const contactModal = document.getElementById('contact-modal');
  on(contactModal, 'click', (event) => {
    if (event.target === contactModal) {
      closeContactModal();
    }
  });
});