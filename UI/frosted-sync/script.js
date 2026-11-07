(function () {
  "use strict";

  const button = document.querySelector(".sync-button");
  const icon = document.querySelector(".sync-button__icon");

  if (!button || !icon) {
    return;
  }

  button.addEventListener("click", () => {
    icon.classList.remove("is-rotating");
    void icon.offsetWidth;
    icon.classList.add("is-rotating");
  });

  icon.addEventListener("animationend", () => {
    icon.classList.remove("is-rotating");
  });
})();
