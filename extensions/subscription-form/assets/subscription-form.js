(function () {
  if (window.__npnSubscribeBound) return;
  window.__npnSubscribeBound = true;

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.classList || !form.classList.contains("npn-form")) {
      return;
    }

    event.preventDefault();

    var button = form.querySelector("button[type='submit']");
    var message = form.querySelector("[data-npn-message]");
    var endpoint = form.getAttribute("data-proxy-path") || "/apps/subscribe";
    var locale = form.getAttribute("data-locale") || "en";
    var separator = endpoint.indexOf("?") >= 0 ? "&" : "?";
    var successText = form.getAttribute("data-msg-success") || "Subscribed";
    var failedText =
      form.getAttribute("data-msg-failed") || "Could not subscribe. Try again.";
    var networkText =
      form.getAttribute("data-msg-network") || "Network error. Try again.";

    if (button) button.disabled = true;

    fetch(endpoint + separator + "locale=" + encodeURIComponent(locale), {
      method: "POST",
      body: new FormData(form),
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        if (!message) return;
        message.hidden = false;
        message.textContent =
          (data && data.message) || (data && data.success ? successText : failedText);
      })
      .catch(function () {
        if (!message) return;
        message.hidden = false;
        message.textContent = networkText;
      })
      .finally(function () {
        if (button) button.disabled = false;
      });
  });
})();
