// UI Helper Functions
export const $ = (id) => document.getElementById(id);

export function showToast(text, duration = 3000) {
  const toast = $("toast");
  const toastText = $("toastText");

  toastText.textContent = text;

  toast.classList.remove("hidden");
  requestAnimationFrame(() => {
    toast.classList.remove("opacity-0", "translate-y-4");
    toast.classList.add("opacity-100", "translate-y-0");
  });

  setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "translate-y-4");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, duration);
}

export function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      textarea.style.left = "-1000px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (successful) {
        resolve();
      } else {
        reject(new Error("copy failed"));
      }
    } catch (err) {
      reject(err);
    }
  });
}

export function twoDigits(n) {
  return (n < 10 ? "0" + n : "" + n);
}

export function setTodayDefaults() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = twoDigits(today.getMonth() + 1);
  const dd = twoDigits(today.getDate());
  const iso = `${yyyy}-${mm}-${dd}`;
  $("date1").value = iso;
  $("date2").value = iso;
  $("date3").value = iso;
}
