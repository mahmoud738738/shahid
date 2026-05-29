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

  // Season Tabs functionality
  var seasonTabs = document.querySelectorAll('.season-tab');
  if (seasonTabs.length) {
    seasonTabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        seasonTabs.forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        
        var targetId = this.getAttribute('data-target');
        var grids = document.querySelectorAll('.episodes-grid');
        grids.forEach(function(g) { g.classList.remove('active'); });
        
        var targetGrid = document.getElementById(targetId);
        if (targetGrid) targetGrid.classList.add('active');
      });
    });
  }

  // Block any attempts to open popups from the page
  window.open = function() { return null; };
});
