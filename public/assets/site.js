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
  var bar=document.querySelector('.m-sticky'),first=document.getElementById('prijava');
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
        if(x.ok){st.textContent='Hvala! Prijava je primljena. Proveri inbox i potvrdi email.';st.classList.add('ok');f.reset();confetti(btn);}
        else{st.textContent=(x.j&&x.j.error)||'Nešto nije u redu. Pokušaj ponovo za minut.';st.classList.add('err');}
      })
      .catch(function(){st.textContent='Nema veze sa serverom. Pokušaj ponovo.';st.classList.add('err');})
      .finally(function(){btn.disabled=false;btn.textContent=label;});
    });
  });
})();
