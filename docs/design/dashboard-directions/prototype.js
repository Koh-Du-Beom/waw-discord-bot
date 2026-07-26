const titles = {
  dashboard: "대시보드",
  commands: "명령어 로그",
  summary: "요약 한도 관리",
  status: "몰랭검거 현황",
  operations: "운영 상태",
};

const sidebar = document.querySelector(".sidebar");
const menuButton = document.querySelector(".menu-button");

function selectTab(tab) {
  if (!(tab in titles)) return;
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const active = panel.id === tab;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    const active = item.dataset.tab === tab;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  document.querySelector("#page-title").textContent = titles[tab];
  history.replaceState(null, "", `#${tab}`);
  sidebar.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => selectTab(button.dataset.tab));
});
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => selectTab(button.dataset.go));
});
menuButton.addEventListener("click", () => {
  const open = sidebar.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});
const userDialog = document.querySelector("#user-dialog");
document.querySelectorAll("[data-user]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#dialog-user").textContent = button.dataset.user;
    userDialog.showModal();
  });
});

selectTab(location.hash.slice(1) || "dashboard");
