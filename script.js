(function(){
  var root = document.documentElement;
  var buttons = document.querySelectorAll('.lang button');
  function setLang(l){
    root.setAttribute('data-lang', l);
    root.setAttribute('lang', l === 'en' ? 'en' : 'pt-BR');
    buttons.forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.set === l ? 'true' : 'false'); });
    try { localStorage.setItem('lang', l); } catch(e){}
  }
  var saved = null;
  try { saved = localStorage.getItem('lang'); } catch(e){}
  if (saved === 'en' || saved === 'pt') setLang(saved);
  buttons.forEach(function(b){ b.addEventListener('click', function(){ setLang(b.dataset.set); }); });

  var els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add('on'); io.unobserve(e.target); } });
    }, {threshold: .12});
    els.forEach(function(el){ io.observe(el); });
  } else { els.forEach(function(el){ el.classList.add('on'); }); }
})();