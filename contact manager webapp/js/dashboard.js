// Same-origin API base. Because it's same-origin, a leading "/LAMPAPI"
// resolves against whatever host is serving the page — no CORS needed.
const urlBase = '/LAMPAPI';
const extension = 'php';

// Current user, read from localStorage on page load. Login.js saves these
// after a successful login.
let userId = 0;
let firstName = "";
let lastName = "";

// Where to send the user when they're not logged in / when they log out.
const loginPage = "index.html";


// ===========================================================================
//  SESSION  — read the logged-in user that Login.js stored in localStorage.
// ===========================================================================

// readSession() runs on load. If there's no stored userId, bounces back to
// the login page. Otherwise greets the user by name (if a name was stored).
function readSession()
{
	let stored = localStorage.getItem("userId");
	userId = stored ? parseInt(stored, 10) : -1;

	firstName = localStorage.getItem("firstName") || "";
	lastName = localStorage.getItem("lastName") || "";

	if (!userId || userId < 1 || isNaN(userId))
	{
		// Not logged in -> go to the login page.
		window.location.href = loginPage;
		return;
	}

	// Show the logged-in name if it was stored and there's a spot for it.
	let nameSpan = document.querySelector('.user-name');
	if (nameSpan && firstName) { nameSpan.textContent = firstName; }
}

// doLogout() clears the stored session and returns to login.
function doLogout()
{
	userId = 0;
	firstName = "";
	lastName = "";
	localStorage.removeItem("userId");
	localStorage.removeItem("firstName");
	localStorage.removeItem("lastName");
	window.location.href = loginPage;
}


// ===========================================================================
//  SHARED HELPER  — one place that does the JSON POST + parse, so each
//  feature function stays short. Calls onSuccess(parsedObject) on a clean
//  200 reply, or onError(messageString) otherwise.
// ===========================================================================
function apiPost(endpoint, payloadObject, onSuccess, onError)
{
	let url = urlBase + '/' + endpoint + '.' + extension;
	let xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-type", "application/json; charset=UTF-8");

	xhr.onreadystatechange = function ()
	{
		if (this.readyState != 4) { return; }   // not finished yet

		if (this.status == 200)
		{
			try
			{
				let obj = xhr.responseText ? JSON.parse(xhr.responseText) : {};
				onSuccess(obj);
			}
			catch (err)
			{
				onError("Bad response from server: " + err.message);
			}
		}
		else
		{
			onError("Request failed (HTTP " + this.status + ").");
		}
	};

	try { xhr.send(JSON.stringify(payloadObject)); }
	catch (err) { onError(err.message); }
}


// ===========================================================================
//  SEARCH (READ)  — wired into the in-place results list on the dashboard.
// ===========================================================================

// The <select> value -> the API search key. The API's search object uses
// firstName / lastName / email / phone, so we map the dropdown to those.
const FIELD_TO_KEY = {
	first_name: 'firstName',
	last_name:  'lastName',
	email:      'email',
	number:     'phone'
};
const FIELD_LABELS = {
	first_name: 'First Name',
	last_name:  'Last Name',
	email:      'Email',
	number:     'Number'
};

function searchContacts()
{
	let input = document.getElementById('contact-search');
	let fieldSelect = document.getElementById('search-field');

	let term = input.value.trim();
	let field = fieldSelect.value;
	let key = FIELD_TO_KEY[field] || 'firstName';

	// Build the search object with just the one chosen field. The API
	// treats an empty/absent field as "match all", so a blank term lists
	// everything for this user.
	let searchObj = {};
	if (term !== "") { searchObj[key] = term; }

	let payload = { userId: userId, search: searchObj };

	apiPost('SearchContacts', payload,
		function (obj)
		{
			if (obj.error)
			{
				renderResults([], term, field, obj.error);
				return;
			}
			renderResults(obj.results || [], term, field, "");
		},
		function (msg)
		{
			renderResults([], term, field, msg);
		}
	);
}

// renderResults() swaps the heading to "Search results" and fills the list.
// Each item is a Contact: {id, firstName, lastName, email, phone}.
function renderResults(results, term, field, errorMsg)
{
	let title = document.getElementById('widget-title');
	let count = document.getElementById('contact-count');
	let emptyState = document.getElementById('empty-state');
	let list = document.getElementById('contact-list');

	title.textContent = 'Search results';

	let label = FIELD_LABELS[field] || field;
	if (errorMsg)
	{
		count.textContent = errorMsg;
	}
	else
	{
		count.textContent = results.length + ' result' +
			(results.length === 1 ? '' : 's') +
			(term ? ' for "' + term + '" in ' + label : '');
	}

	emptyState.hidden = true;
	list.hidden = false;
	list.innerHTML = '';

	if (results.length === 0)
	{
		let li = document.createElement('li');
		li.className = 'no-results';
		li.textContent = errorMsg ? '' : 'No contacts matched your search.';
		list.appendChild(li);
		return;
	}

	results.forEach(function (c)
	{
		let fullName = ((c.firstName || '') + ' ' + (c.lastName || '')).trim();
		let detail = c.phone || c.email || '';

		let li = document.createElement('li');
		li.className = 'contact-card';
		li.setAttribute('data-id', c.id);
		li.setAttribute('tabindex', '0');     // keyboard-focusable
		li.setAttribute('role', 'button');
		li.innerHTML =
			'<div class="contact-info">' +
				'<h3 class="contact-name"></h3>' +
				'<p class="contact-detail"></p>' +
			'</div>';
		// textContent (not innerHTML) so a contact's data can't inject markup.
		li.querySelector('.contact-name').textContent = fullName;
		li.querySelector('.contact-detail').textContent = detail;

		// Clicking (or Enter/Space on) the card opens the edit/delete popup.
		li.addEventListener('click', function () { openContactModal(c); });
		li.addEventListener('keydown', function (e)
		{
			if (e.key === 'Enter' || e.key === ' ')
			{
				e.preventDefault();
				openContactModal(c);
			}
		});

		list.appendChild(li);
	});
}


// ===========================================================================
//  ADD (CREATE)
// ===========================================================================

function addContact()
{
	let fn = document.getElementById('add-first-name').value.trim();
	let ln = document.getElementById('add-last-name').value.trim();
	let email = document.getElementById('add-email').value.trim();
	let phone = document.getElementById('add-phone').value.trim();
	let resultSpan = document.getElementById('add-contact-result');

	resultSpan.textContent = "";

	// Basic client-side checks. The API requires all four fields, and phone
	// must look like ###-###-####.
	if (!fn || !ln || !email || !phone)
	{
		resultSpan.textContent = "Please fill in first name, last name, email, and phone.";
		return;
	}
	if (!/^\d{3}-\d{3}-\d{4}$/.test(phone))
	{
		resultSpan.textContent = "Phone must be in the format ###-###-#### (e.g. 407-555-1234).";
		return;
	}

	let payload = {
		userId: userId,
		firstName: fn,
		lastName: ln,
		email: email,
		phone: phone
	};

	apiPost('AddContact', payload,
		function (obj)
		{
			if (obj.error)
			{
				resultSpan.textContent = obj.error;
				return;
			}
			resultSpan.textContent = "Contact added.";
			// Once a contact has been added this session, hide the empty-state
			// card so it doesn't keep prompting "Add Contact".
			let emptyCard = document.getElementById('empty-state');
			if (emptyCard) { emptyCard.hidden = true; }
			// Clear the form for the next entry.
			document.getElementById('add-first-name').value = "";
			document.getElementById('add-last-name').value = "";
			document.getElementById('add-email').value = "";
			document.getElementById('add-phone').value = "";
			// Close the popup shortly after, so the user sees the confirmation.
			setTimeout(closeAddModal, 800);
		},
		function (msg) { resultSpan.textContent = msg; }
	);
}


// ===========================================================================
//  ADD-CONTACT MODAL  — open/close the popup. No page refresh involved.
// ===========================================================================
function openAddModal()
{
	let modal = document.getElementById('add-contact-modal');
	if (!modal) { return; }
	document.getElementById('add-contact-result').textContent = "";
	modal.hidden = false;
	let first = document.getElementById('add-first-name');
	if (first) { first.focus(); }
}

function closeAddModal()
{
	let modal = document.getElementById('add-contact-modal');
	if (modal) { modal.hidden = true; }
}


// ===========================================================================
//  EDIT (UPDATE)  — called by the contact popup's Edit button. contactId is
//  the contact being edited; the four fields are the new values.
// ===========================================================================
function editContact(contactId, fn, ln, email, phone, onDone)
{
	let payload = {
		userId: userId,
		contactId: contactId,
		firstName: fn,
		lastName: ln,
		email: email,
		phone: phone
	};

	apiPost('EditContact', payload,
		function (obj)
		{
			if (onDone) { onDone(obj.error ? obj.error : ""); }
		},
		function (msg) { if (onDone) { onDone(msg); } }
	);
}


// ===========================================================================
//  DELETE  — called by the contact popup after the user confirms.
// ===========================================================================
function deleteContact(contactId, onDone)
{
	let payload = { userId: userId, contactId: contactId };

	apiPost('DeleteContact', payload,
		function (obj)
		{
			if (onDone) { onDone(obj.error ? obj.error : ""); }
		},
		function (msg) { if (onDone) { onDone(msg); } }
	);
}


// ===========================================================================
//  CONTACT MODAL (EDIT / DELETE)  — opens when a search result is clicked.
//  Fields are pre-filled and editable. Edit (bottom right) saves; Delete
//  (bottom left) asks for confirmation, then removes the contact. No refresh.
// ===========================================================================

// The contact currently open in the popup.
let activeContact = null;

function openContactModal(contact)
{
	activeContact = contact;

	// Pre-fill the editable fields.
	document.getElementById('edit-first-name').value = contact.firstName || '';
	document.getElementById('edit-last-name').value = contact.lastName || '';
	document.getElementById('edit-email').value = contact.email || '';
	document.getElementById('edit-phone').value = contact.phone || '';
	document.getElementById('edit-contact-result').textContent = '';

	// Make sure we start on the normal action row, not the confirm row.
	showEditActions();

	document.getElementById('contact-modal').hidden = false;
}

function closeContactModal()
{
	let modal = document.getElementById('contact-modal');
	if (modal) { modal.hidden = true; }
	activeContact = null;
}

// Toggle between the normal Delete/Edit row and the "Are you sure?" row.
function showEditActions()
{
	document.getElementById('contact-actions').hidden = false;
	document.getElementById('contact-confirm-delete').hidden = true;
}
function showDeleteConfirm()
{
	document.getElementById('contact-actions').hidden = true;
	document.getElementById('contact-confirm-delete').hidden = false;
}

// Edit button -> validate and save the four fields.
function saveContactEdit()
{
	if (!activeContact) { return; }
	let resultSpan = document.getElementById('edit-contact-result');

	let fn = document.getElementById('edit-first-name').value.trim();
	let ln = document.getElementById('edit-last-name').value.trim();
	let email = document.getElementById('edit-email').value.trim();
	let phone = document.getElementById('edit-phone').value.trim();

	resultSpan.textContent = '';

	if (!fn || !ln || !email || !phone)
	{
		resultSpan.textContent = "Please fill in all four fields.";
		return;
	}
	if (!/^\d{3}-\d{3}-\d{4}$/.test(phone))
	{
		resultSpan.textContent = "Phone must be in the format ###-###-#### (e.g. 407-555-1234).";
		return;
	}

	editContact(activeContact.id, fn, ln, email, phone, function (err)
	{
		if (err)
		{
			resultSpan.textContent = err;
			return;
		}
		resultSpan.textContent = "Changes saved.";
		setTimeout(function ()
		{
			closeContactModal();
			searchContacts();   // refresh the list to show the update
		}, 800);
	});
}

// Yes button on the confirm row -> actually delete.
function confirmDeleteContact()
{
	if (!activeContact) { return; }
	let resultSpan = document.getElementById('edit-contact-result');

	deleteContact(activeContact.id, function (err)
	{
		if (err)
		{
			resultSpan.textContent = err;
			showEditActions();   // back to normal row so they can retry
			return;
		}
		closeContactModal();
		searchContacts();        // refresh the list; the contact is gone
	});
}


// ===========================================================================
//  WIRE-UP  — connect DOM elements to the functions once the page loads.
// ===========================================================================
document.addEventListener('DOMContentLoaded', function ()
{
	readSession();   // login guard + greeting

	// Search form: intercept submit so it doesn't navigate away.
	let searchForm = document.querySelector('.search-container form');
	if (searchForm)
	{
		searchForm.addEventListener('submit', function (e)
		{
			e.preventDefault();
			searchContacts();
		});
	}

	// Logout link in the sidebar.
	let logout = document.querySelector('.logout-link');
	if (logout)
	{
		logout.addEventListener('click', function (e)
		{
			e.preventDefault();
			doLogout();
		});
	}

	// Add-contact form submit -> AJAX, no refresh.
	let addForm = document.getElementById('add-contact-form');
	if (addForm)
	{
		addForm.addEventListener('submit', function (e)
		{
			e.preventDefault();
			addContact();
		});
	}

	// The empty-state "Add your first contact" button opens the modal.
	let firstBtn = document.getElementById('add-first-contact-btn');
	if (firstBtn)
	{
		firstBtn.addEventListener('click', openAddModal);
	}

	// The sidebar "Add Contact" link opens the modal too.
	let sidebarAdd = document.querySelector('a[href="#add-contact"]');
	if (sidebarAdd)
	{
		sidebarAdd.addEventListener('click', function (e)
		{
			e.preventDefault();
			openAddModal();
		});
	}

	// Close: the X button, clicking the dark backdrop, or pressing Escape.
	let closeBtn = document.getElementById('add-modal-close');
	if (closeBtn) { closeBtn.addEventListener('click', closeAddModal); }

	let modal = document.getElementById('add-contact-modal');
	if (modal)
	{
		modal.addEventListener('click', function (e)
		{
			// Only close when the backdrop itself is clicked, not the box.
			if (e.target === modal) { closeAddModal(); }
		});
	}

	document.addEventListener('keydown', function (e)
	{
		if (e.key === 'Escape') { closeAddModal(); closeContactModal(); }
	});

	// ---- Contact popup (edit / delete) ----
	let editBtn = document.getElementById('contact-edit-btn');
	if (editBtn) { editBtn.addEventListener('click', saveContactEdit); }

	let deleteBtn = document.getElementById('contact-delete-btn');
	if (deleteBtn) { deleteBtn.addEventListener('click', showDeleteConfirm); }

	let confirmYes = document.getElementById('confirm-delete-yes');
	if (confirmYes) { confirmYes.addEventListener('click', confirmDeleteContact); }

	let confirmNo = document.getElementById('confirm-delete-no');
	if (confirmNo) { confirmNo.addEventListener('click', showEditActions); }

	let contactClose = document.getElementById('contact-modal-close');
	if (contactClose) { contactClose.addEventListener('click', closeContactModal); }

	let contactModal = document.getElementById('contact-modal');
	if (contactModal)
	{
		contactModal.addEventListener('click', function (e)
		{
			if (e.target === contactModal) { closeContactModal(); }
		});
	}
});
