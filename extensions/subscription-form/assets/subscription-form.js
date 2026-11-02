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

    if (button) button.disabled = true;

    fetch(endpoint, {
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
          (data && data.message) ||
          (data && data.success ? "订阅成功" : "订阅失败，请稍后重试");
      })
      .catch(function () {
        if (!message) return;
        message.hidden = false;
        message.textContent = "网络错误，请稍后重试";
      })
      .finally(function () {
        if (button) button.disabled = false;
      });
  });
})();
