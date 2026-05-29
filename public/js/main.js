document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.getElementById('menuToggle');
  var nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function() {
      nav.classList.toggle('open');
    });
  }

  var tabs = document.querySelectorAll('.server-tab');
  var iframe = document.getElementById('playerIframe');
  if (tabs.length && iframe) {
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        iframe.src = this.getAttribute('data-embed');
      });
    });
  }
});
