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
  var adShield = document.getElementById('adShield');
  if (tabs.length && iframe) {
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        iframe.src = this.getAttribute('data-embed');
        // Reset ad shield on server change
        if (adShield) adShield.style.display = 'block';
      });
    });
  }

  // Block any attempts to open popups from the page
  window.open = function() { return null; };
});
