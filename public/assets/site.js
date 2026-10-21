// Klasiko: zajednički kod za podstranice i blog
(function(){
  document.documentElement.classList.add('js');
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePtr=window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  // Traka napretka i senka zaglavlja
  var prog=document.querySelector('.progress'),hdr=document.querySelector('.hdr'),tick=false;
  function onScroll(){
    tick=false;var y=window.scrollY||0,max=document.documentElement.scrollHeight-window.innerHeight;
    if(prog)prog.style.setProperty('--pr',max>0?Math.min(1,y/max):0);
    if(hdr)hdr.classList.toggle('scrolled',y>10);
  }
  window.addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(onScroll);}},{passive:true});onScroll();

  // Pojavljivanje pri skrolovanju
  var items=document.querySelectorAll('.sec-head,.grid>*,.links>*,.posts>*,.faq>details,.panel,.steps>li,.cta,.prose>h2,.callout,.inline-cta,.tbl');
  if(!reduce&&'IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:.08});
    Array.prototype.forEach.call(items,function(el){
      var sib=el.parentElement?Array.prototype.indexOf.call(el.parentElement.children,el):0;
      el.style.setProperty('--d',((sib%6)*70)+'ms');el.classList.add('rv');io.observe(el);
    });
  }

  // Reflektor na karticama
  if(finePtr){
    document.querySelectorAll('.card').forEach(function(c){
      c.addEventListener('pointermove',function(e){var b=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-b.left)+'px');c.style.setProperty('--my',(e.clientY-b.top)+'px');});
    });
  }

  // Glatko otvaranje FAQ odgovora
  if(!reduce&&Element.prototype.animate){
    document.querySelectorAll('.faq details').forEach(function(d){
      var sum=d.querySelector('summary'),body=d.querySelector('p');if(!sum||!body)return;
      sum.addEventListener('click',function(e){
        e.preventDefault();
        if(d.open){
          var a=body.animate([{height:body.offsetHeight+'px',opacity:1,marginTop:'12px'},{height:'0px',opacity:0,marginTop:'0px'}],{duration:280,easing:'cubic-bezier(.4,0,.2,1)'});
          a.onfinish=function(){d.open=false;};
        }else{
          d.open=true;
          body.animate([{height:'0px',opacity:0,marginTop:'0px'},{height:body.offsetHeight+'px',opacity:1,marginTop:'12px'}],{duration:340,easing:'cubic-bezier(.16,1,.3,1)'});
        }
      });
    });
  }

  // Lepljiva traka na telefonu
  var bar=document.querySelector('.m-sticky'),first=document.getElementById('prijava')||document.querySelector('.hero .demo-btns')||document.querySelector('.hero');
  if(bar&&first&&'IntersectionObserver' in window){
    new IntersectionObserver(function(es){es.forEach(function(e){bar.classList.toggle('show',!e.isIntersecting&&e.boundingClientRect.top<0);});}).observe(first);
  }else if(bar){bar.classList.add('show');}

  // Konfete posle uspešne prijave
  function confetti(el){
    if(reduce||!Element.prototype.animate)return;
    var b=el.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2,cols=['#5B2A86','#FF6B5E','#E6DAF2','#FFC4BD','#7A4BA6'];
    for(var i=0;i<36;i++){
      var p=document.createElement('span');p.className='confetti';p.style.left=cx+'px';p.style.top=cy+'px';p.style.background=cols[i%cols.length];
      document.body.appendChild(p);
      var ang=Math.random()*Math.PI*2,dist=80+Math.random()*140,dx=Math.cos(ang)*dist,dy=Math.sin(ang)*dist-60;
      p.animate([{transform:'translate(-50%,-50%) rotate(0)',opacity:1},{transform:'translate('+dx+'px,'+(dy+160)+'px) rotate('+(Math.random()*720-360)+'deg)',opacity:0}],{duration:1100+Math.random()*600,easing:'cubic-bezier(.2,.6,.4,1)'}).onfinish=(function(n){return function(){n.remove();};})(p);
    }
  }

  // Stranica hvala: konfete i kopiranje linka
  if(document.querySelector('.thanks')){var ck=document.querySelector('.tk-check');if(ck)setTimeout(function(){confetti(ck);},1100);}
  document.querySelectorAll('[data-copy]').forEach(function(b){
    b.addEventListener('click',function(){
      var u=b.getAttribute('data-copy'),l=b.textContent;
      var done=function(){b.textContent='Link je kopiran';setTimeout(function(){b.textContent=l;},2000);};
      if(navigator.share&&window.matchMedia('(pointer:coarse)').matches){navigator.share({title:'Klasiko',url:u}).catch(function(){});return;}
      if(navigator.clipboard){navigator.clipboard.writeText(u).then(done,function(){window.prompt('Kopiraj link:',u);});}
      else{window.prompt('Kopiraj link:',u);}
    });
  });

  // Meta Pixel, učitava se tek posle pristanka (isti izbor važi na celom sajtu)
  (function(){
    var PIXEL_ID='1620883076403226',GA_ID='G-LVY1D42QZP',KEY='klasiko_consent';
    function loadGA(){
      if(!GA_ID||window.__klasikoGA)return;window.__klasikoGA=true;
      window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments);};
      gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
      var g=document.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtag/js?id='+GA_ID;document.head.appendChild(g);
      gtag('js',new Date());gtag('config',GA_ID);
    }
    function load(){
      loadGA();
      if(!PIXEL_ID||window.fbq)return;
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init',PIXEL_ID);fbq('track','PageView');
    }
    var c=null;try{c=localStorage.getItem(KEY);}catch(e){}
    var box=document.getElementById('cookie');
    if(c==='yes'){load();}else if(c!=='no'&&box){box.hidden=false;}
    if(box)box.addEventListener('click',function(e){var v=e.target.getAttribute('data-consent');if(!v)return;
      try{localStorage.setItem(KEY,v);}catch(err){}box.hidden=true;if(v==='yes')load();});
    window.klasikoTrackLead=function(src){if(window.fbq)fbq('track','Lead',{content_name:'Lista cekanja',source:src});if(window.__klasikoGA)gtag('event','generate_lead',{source:src});};
  })();

  // Cene: mesečno / godišnje
  document.querySelectorAll('.bill-toggle').forEach(function(tg){
    var plans=tg.parentElement.querySelector('.plans');
    tg.addEventListener('click',function(e){
      var b=e.target.closest('button[data-bill]');if(!b||!plans)return;
      tg.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);});
      plans.setAttribute('data-bill',b.getAttribute('data-bill'));
    });
  });

  // Forma za demo
  document.querySelectorAll('form[data-demo]').forEach(function(f){
    var pk=(location.search.match(/[?&]paket=([a-z]+)/)||[])[1];
    if(pk&&f.elements.plan)f.elements.plan.value=pk;
    f.addEventListener('submit',function(e){
      e.preventDefault();
      var btn=f.querySelector('button[type=submit]'),st=f.querySelector('.status');
      var data={};Array.prototype.forEach.call(f.elements,function(el){if(el.name)data[el.name]=(el.value||'').trim();});
      st.className='status';
      if(!data.name){st.textContent='Unesi ime.';st.classList.add('err');f.elements.name.focus();return;}
      if((data.phone||'').replace(/\D/g,'').length<6){st.textContent='Unesi broj telefona da bismo te pozvali.';st.classList.add('err');f.elements.phone.focus();return;}
      data.source=location.pathname;
      var label=btn.textContent;btn.disabled=true;btn.textContent='Šaljem...';
      fetch('/api/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json().catch(function(){return{};}).then(function(j){return{ok:r.ok,j:j};});})
      .then(function(x){
        if(x.ok){if(window.klasikoTrackLead)window.klasikoTrackLead('demo');st.textContent='Hvala! Javljamo se uskoro.';st.classList.add('ok');f.reset();setTimeout(function(){location.href='/hvala-demo';},500);}
        else{st.textContent=(x.j&&x.j.error)||'Slanje nije uspelo. Pozovi nas ili piši na WhatsApp.';st.classList.add('err');}
      })
      .catch(function(){st.textContent='Nema veze sa serverom. Pozovi nas ili piši na WhatsApp.';st.classList.add('err');})
      .finally(function(){btn.disabled=false;btn.textContent=label;});
    });
  });

  // Forme za listu čekanja
  var re=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  document.querySelectorAll('form[data-waitlist]').forEach(function(f){
    f.addEventListener('submit',function(e){
      e.preventDefault();
      var inp=f.querySelector('input[name=email]'),btn=f.querySelector('button[type=submit]'),st=f.querySelector('.status');
      var email=(inp.value||'').trim();
      st.className='status';
      if(!re.test(email)){st.textContent='Unesi ispravnu email adresu.';st.classList.add('err');inp.focus();return;}
      var label=btn.textContent;btn.disabled=true;btn.textContent='Šaljem...';st.textContent='';
      fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:email,company:(f.querySelector('input[name=company]')||{}).value||'',source:f.getAttribute('data-waitlist')})})
      .then(function(res){return res.json().catch(function(){return{};}).then(function(j){return{ok:res.ok,j:j};});})
      .then(function(x){
        if(x.ok){st.textContent='Hvala! Prijava je primljena. Proveri inbox i potvrdi email.';st.classList.add('ok');f.reset();if(window.klasikoTrackLead)window.klasikoTrackLead(f.getAttribute('data-waitlist'));confetti(btn);setTimeout(function(){window.location.href='/hvala';},700);return;}
        else{st.textContent=(x.j&&x.j.error)||'Nešto nije u redu. Pokušaj ponovo za minut.';st.classList.add('err');}
      })
      .catch(function(){st.textContent='Nema veze sa serverom. Pokušaj ponovo.';st.classList.add('err');})
      .finally(function(){btn.disabled=false;btn.textContent=label;});
    });
  });
})();
