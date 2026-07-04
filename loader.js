(function() {
    var d = document;
    
    var l = d.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'style.css';
    d.head.appendChild(l);
    
    var s = d.createElement('script');
    s.src = 'main.js';
    d.head.appendChild(s);
})();