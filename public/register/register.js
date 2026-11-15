const form = document.querySelector('#registration-form');
const password = document.querySelector('#password');
const confirmation = document.querySelector('#confirm-password');
const message = document.querySelector('#form-message');
const submitButton = form.querySelector('button[type="submit"]');

function validateConfirmation() {
  confirmation.setCustomValidity(
    confirmation.value && confirmation.value !== password.value
      ? 'Passwords do not match.'
      : ''
  );
}

password.addEventListener('input', validateConfirmation);
confirmation.addEventListener('input', validateConfirmation);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  message.textContent = 'Registration is not available yet. No account was created.';
});

submitButton.disabled = false;
