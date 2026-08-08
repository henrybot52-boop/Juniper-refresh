(function () {
const navToggle = document.querySelector('[data-nav-toggle]');
const navMenu = document.querySelector('[data-nav-menu]');

if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('hidden');
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0,
    rootMargin: '0px 0px 100px 0px',
  }
);

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

// Fallback: reveal all elements after a short delay (catches race conditions with CSS loading)
setTimeout(() => {
  document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 100) {
      el.classList.add('is-visible');
    }
  });
}, 500);
})();
