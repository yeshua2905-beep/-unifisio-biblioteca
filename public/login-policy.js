// Restoring a cached window must go through the server's fresh-login policy.
window.addEventListener('pageshow', function (event) {
  if (event.persisted) window.location.reload();
});
