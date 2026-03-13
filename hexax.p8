pico-8 cartridge // http://www.pico-8.com
version 42
__lua__

cx,cy,r0=64,66,58
nd,nl=6,6

function addscore(n)
 slo+=n
 while slo>=10000 do
  slo-=10000
  shi+=1
 end
end

function getscore()
 if shi>0 then
  local s=tostr(slo)
  while #s<4 do s="0"..s end
  return tostr(shi)..s
 end
 return tostr(slo)
end

function setpal()
 poke(0x5f2e,1)
 pal(1,129,1)  -- deep navy
 pal(2,131,1)  -- dark teal
 pal(4,140,1)  -- rich blue
 pal(5,141,1)  -- dusty purple
 pal(9,137,1)  -- vivid orange
 pal(15,135,1) -- pale gold
end

function _init()
 setpal()
 wrot,ra=0,0
 shi,slo,hp,mult=0,0,100,1
 whits,fcd=0,0
 et,bt,elapsed,sbud=0,0,0,0
 over,ttl=false,true
 ens,bls,exps={},{},{}
 cespd=24
 dmgseg={}
 for i=0,5 do dmgseg[i]=0 end
end

function scl(d)
 return 1-.85*(d/nd)^.7
end

function vtx(d,vi)
 local s=scl(d)
 local a=(vi+4)/nl+ra
 return cx+cos(a)*r0*s,cy+sin(a)*r0*s
end

function vln(ln)
 return(ln-wrot+600)%nl
end

function fmp(d,f)
 local x1,y1=vtx(d,f)
 local x2,y2=vtx(d,(f+1)%nl)
 return(x1+x2)/2,(y1+y2)/2
end

-- normalized dir toward center + perp
function dirs(x,y)
 local dx,dy=cx-x,cy-y
 local l=max(1,sqrt(dx*dx+dy*dy))
 return dx/l,dy/l,-dy/l,dx/l
end

function boom(x,y,c,n)
 for i=1,(n or 10) do
  local a=rnd(1)
  local sp=.5+rnd(1.5)
  add(exps,{x=x,y=y,dx=cos(a)*sp,dy=sin(a)*sp,t=12+rnd(8),c=c,ln=.8+rnd(2.2)})
 end
end

function pboom(c)
 local x,y=fmp(0,0)
 boom(x,y,c or 8)
end

-- rotated ellipse
function doval(ox,oy,rx,ry,rot,c,n)
 n=n or 10
 local cr,sr=cos(rot),sin(rot)
 local lx,ly
 for i=0,n do
  local a=i/n
  local x=cos(a)*rx
  local y=sin(a)*ry
  local sx=ox+x*cr-y*sr
  local sy=oy+x*sr+y*cr
  if lx then line(lx,ly,sx,sy,c) end
  lx,ly=sx,sy
 end
end

-- rotated ellipse arc
function darc(ox,oy,rx,ry,rot,c,a1,a2,n)
 n=n or 6
 local cr,sr=cos(rot),sin(rot)
 local lx,ly
 for i=0,n do
  local t=a1+(a2-a1)*i/n
  local x=cos(t)*rx
  local y=sin(t)*ry
  local sx=ox+x*cr-y*sr
  local sy=oy+x*sr+y*cr
  if lx then line(lx,ly,sx,sy,c) end
  lx,ly=sx,sy
 end
end

-- 3d puck
function draw_puck(x,y,sz,c,dash)
 local nx,ny,px,py=dirs(x,y)
 local tilt,th=.35,sz*.25
 local rot=atan2(px,py)
 local bx,by=x+nx*th,y+ny*th
 if dash then
  for i=0,5 do
   if i%2==0 then
    darc(bx,by,sz,sz*tilt,rot,c,i/6,(i+1)/6,3)
   end
  end
 else
  doval(bx,by,sz,sz*tilt,rot,c)
 end
 local fx,fy=x-nx*th,y-ny*th
 line(bx+px*sz,by+py*sz,fx+px*sz,fy+py*sz,c)
 line(bx-px*sz,by-py*sz,fx-px*sz,fy-py*sz,c)
 local oa=atan2(x-cx,y-cy)
 if dash then
  for i=0,2 do
   if i%2==0 then
    darc(fx,fy,sz,sz*tilt,rot,c,oa-rot-.25+i/6,oa-rot-.25+(i+1)/6,3)
   end
  end
 else
  darc(fx,fy,sz,sz*tilt,rot,c,oa-rot-.25,oa-rot+.25,8)
 end
end

-- 3d sphere
function draw_sph(x,y,r,c)
 circ(x,y,r,c)
 local nx,ny,px,py=dirs(x,y)
 local rot=atan2(px,py)
 doval(x,y,r,r*.3,rot,c,8)
 doval(x,y,r*.3,r,rot,c,8)
 local hx,hy=x-px*r*.35-nx*r*.2,y-py*r*.35-ny*r*.2
 line(hx-px*max(1,r*.12),hy-py*max(1,r*.12),
      hx+px*max(1,r*.12),hy+py*max(1,r*.12),7)
 pset(hx,hy,7)
 line(x+nx*r*.2,y+ny*r*.2,x-nx*r*.45,y-ny*r*.45,c)
end

---------- collision ----------
function do_hit(b,e)
 local vf=vln(e.ln)
 local prog=min(1,et/cespd)
 local ed=e.pd+(e.dp-e.pd)*prog
 if ed<0 then ed=0 end
 local ex,ey=fmp(ed,vf)

 if e.tp==2 or e.tp==8 then
  b.alive=false
  e.hf=1
  sfx(3)
  return true
 end
 if e.tp==6 and e.dp>2 then
  b.alive=false
  e.hf=1
  sfx(3)
  return true
 end

 b.alive=false
 local db=e.dp>=4 and 1.5 or 1

 if e.tp==3 then
  e.hp-=1
  addscore(flr(50*db*mult))
  boom(ex,ey,12,5)
  if e.hp<=0 then
   e.alive=false
   addscore(flr(150*db*mult))
   boom(ex,ey,12)
  end
 elseif e.tp==4 then
  e.alive=false
  boom(ex,ey,10)
  addscore(flr(100*db*mult))
  for e2 in all(ens) do
   if e2.alive and e2.tp~=2 and e2.tp~=8 and e2~=e then
    e2.alive=false
    addscore(flr(100*mult))
    local v2=vln(e2.ln)
    local x2,y2=fmp(e2.dp,v2)
    boom(x2,y2,e2.tp==3 and 12 or e2.tp==5 and 14 or e2.tp==6 and 13 or 9,4)
   end
  end
  mult=min(4,mult+.5)
 elseif e.tp==5 then
  e.alive=false
  hp=100
  whits=0
  for i=0,5 do dmgseg[i]=0 end
  boom(ex,ey,14,8)
  sfx(4)
 else
  e.alive=false
  addscore(flr(100*db*mult))
  local cc=e.tp==6 and 13 or e.tp==7 and 11 or 9
  boom(ex,ey,cc)
 end

 if e.tp~=5 then
  mult=min(4,mult+.1)
 end
 sfx(1)
 return true
end

function collide()
 for b in all(bls) do
  if not b.alive then goto nb end
  for e in all(ens) do
   if e.alive and e.tp==2 and b.ln==e.ln and b.dp==e.dp then
    do_hit(b,e)
    goto nb
   end
   if e.alive and e.tp==8 and b.dp==e.dp and
      (b.ln==e.ln or b.ln==(e.ln+1)%nl) then
    do_hit(b,e)
    goto nb
   end
  end
  for e in all(ens) do
   if e.alive and e.tp~=2 and b.ln==e.ln and b.dp==e.dp then
    if do_hit(b,e) then goto nb end
   end
  end
  ::nb::
 end
end

function clean(t)
 for i=#t,1,-1 do
  if not t[i].alive then deli(t,i) end
 end
end

---------- spawn ----------
function spawn_ent()
 local s=elapsed
 local pool,tw={},0
 local defs={
  {1,55,0},{2,14,20},{3,11,15},
  {4,9,100},{5,2,100},
  {6,10,15},{7,16,70},{8,9,70}
 }
 local nw=0
 for e in all(ens) do
  if e.tp==2 or e.tp==8 then nw+=1 end
 end
 local mw=min(1+flr(s/35),4)
 for d in all(defs) do
  if s>=d[3] and
     not((d[1]==2 or d[1]==8) and nw>=mw) and
     not(d[1]==5 and hp>=80) then
   add(pool,{d[1],d[2]})
   tw+=d[2]
  end
 end
 if tw==0 then return end
 local r,acc=rnd(tw),0
 local tp=pool[1][1]
 for p in all(pool) do
  acc+=p[2]
  if r<=acc then
   tp=p[1]
   break
  end
 end
 local e={ln=flr(rnd(nl)),dp=nd,pd=nd,tp=tp,alive=true,hf=0}
 if tp==3 then e.hp=2 end
 if tp==7 then
  e.sdir=rnd(1)<.5 and 1 or -1
  e.stk=0
  e.pln=e.ln
 end
 add(ens,e)
end

---------- update ----------
function _update()
 if ttl then
  if btnp(4) or btnp(5) then ttl=false end
  return
 end
 if over then
  if btnp(4) or btnp(5) then
   _init()
   ttl=false
  end
  return
 end

 if ra==0 then
  if btnp(1) then
   wrot=(wrot+1)%nl
   ra=1/nl
   sfx(2)
  elseif btnp(0) then
   wrot=(wrot+5)%nl
   ra=-1/nl
   sfx(2)
  end
 end

 if (btnp(4) or btnp(5)) and fcd<=0 then
  add(bls,{ln=wrot,dp=0,pd=0,alive=true})
  fcd=2
  sfx(0)
 end

 if ra>0 then
  ra=max(0,ra-.028)
 elseif ra<0 then
  ra=min(0,ra+.028)
 end

 elapsed+=1/30
 cespd=24-9*min(1,elapsed/240)
 et+=1

 if et>=cespd then
  et=0
  local si=3.5-2.5*min(1,elapsed/300)
  sbud+=1
  if sbud>=si then
   sbud-=si
   spawn_ent()
  end
 for e in all(ens) do
  if e.alive then
   e.pd=e.dp
   e.dp-=1
    if e.tp==7 then
     e.stk+=1
     if e.stk>=2 then
      e.stk=0
      e.pln=e.ln
      e.ln=(e.ln+e.sdir+nl)%nl
     end
    end
   end
  end
  collide()
  for e in all(ens) do
   if e.alive and e.dp<0 then
    e.alive=false
    local onp=vln(e.ln)==0
    if e.tp==8 then
     onp=onp or vln((e.ln+1)%nl)==0
    end
    if e.tp==2 or e.tp==8 then
     if onp then
      whits+=1
      if whits>=3 then
       hp=0
      else
       hp-=whits==1 and 30 or 60
      end
      mult=1
      pboom(8)
      sfx(5)
     end
    else
     local dmg=10
     if e.tp==3 then
      dmg=e.hp==2 and 20 or 10
     elseif e.tp==4 then
      dmg=20
     end
     hp-=dmg
     mult=1
     if e.tp~=5 then
      local seg=vln(e.ln)
      dmgseg[seg]+=1
      if dmgseg[seg]>=2 then hp=0 end
     end
     pboom(8)
     sfx(5)
    end
   end
  end
  clean(ens)
  if hp<=0 then
   hp=0
   over=true
   sfx(5)
   for i=0,5 do
    local x,y=fmp(0,i)
    boom(x,y,8+flr(rnd(4)),5)
   end
  end
 end

 bt+=1
 if bt>=6 then
  bt=0
  fcd=max(0,fcd-1)
  collide()
  clean(ens)
  clean(bls)
  for b in all(bls) do
   if b.alive then
    b.pd=b.dp
    b.dp+=1
    if b.dp>nd then b.alive=false end
   end
  end
  collide()
  clean(ens)
  clean(bls)
 end

 for i=#exps,1,-1 do
  local p=exps[i]
  p.x+=p.dx
  p.y+=p.dy
  p.dx*=.88
  p.dy*=.88
  p.t-=1
  if p.t<=0 then deli(exps,i) end
 end

 for e in all(ens) do
  if e.hf and e.hf>0 then
   e.hf=max(0,e.hf-.08)
  end
 end
end

---------- drawing ----------
function draw_tunnel()
 for i=0,5 do
  local x1,y1=vtx(0,i)
  local x2,y2=vtx(nd,i)
  line(x1,y1,x2,y2,1)
 end
 for d=nd,0,-1 do
  local c=3
  if d==0 then c=11 end
  for i=0,5 do
   local x1,y1=vtx(d,i)
   local x2,y2=vtx(d,(i+1)%nl)
   if d==0 and dmgseg[i]>0 then
    local pulse=sin(elapsed*3)>.2
    c=dmgseg[i]>=2 and (pulse and 8 or 2) or (pulse and 10 or 4)
   elseif d==0 then
    c=11
   end
   line(x1,y1,x2,y2,c)
   if d==0 then c=11 end
  end
 end
 local x1,y1=vtx(0,0)
 local x2,y2=vtx(0,1)
 line(x1,y1,x2,y2,7)
end

function draw_ent(e)
 local vf=vln(e.ln)
 local prog=min(1,et/max(1,cespd))
 local ed=e.pd+(e.dp-e.pd)*prog
 if ed<-.5 then return end
 ed=max(0,ed)
 local ex,ey=fmp(ed,vf)
 local s=scl(ed)
 local sz=max(2,ceil(8*s))

 if e.tp==1 then
  draw_puck(ex,ey,sz,9)

 elseif e.tp==2 then
  local c=11
  if e.hf and e.hf>.3 then c=7 end
  local v1x,v1y=vtx(ed,vf)
  local v2x,v2y=vtx(ed,(vf+1)%nl)
  local h=max(2,flr(6*s))
  local mx,my=(v1x+v2x)/2,(v1y+v2y)/2
  local dx,dy=cx-mx,cy-my
  local l=sqrt(dx*dx+dy*dy)
  if l>0 then dx,dy=dx/l*h,dy/l*h end
  -- front face
  line(v1x,v1y,v2x,v2y,c)
  line(v2x,v2y,v2x+dx,v2y+dy,c)
  line(v2x+dx,v2y+dy,v1x+dx,v1y+dy,c)
  line(v1x+dx,v1y+dy,v1x,v1y,c)
  -- back face (depth thickness)
  local bd=min(nd,ed+.15)
  local b1x,b1y=vtx(bd,vf)
  local b2x,b2y=vtx(bd,(vf+1)%nl)
  local bh=max(2,flr(6*scl(bd)))
  local bmx,bmy=(b1x+b2x)/2,(b1y+b2y)/2
  local bx,by=cx-bmx,cy-bmy
  local bl=sqrt(bx*bx+by*by)
  if bl>0 then bx,by=bx/bl*bh,by/bl*bh end
  -- depth connecting lines + back top edge
  line(v1x+dx,v1y+dy,b1x+bx,b1y+by,c)
  line(v2x+dx,v2y+dy,b2x+bx,b2y+by,c)
  line(b1x+bx,b1y+by,b2x+bx,b2y+by,c)

 elseif e.tp==8 then
  local c=11
  if e.hf and e.hf>.3 then c=7 end
  local bc=c==7 and 5 or 1
  local v1x,v1y=vtx(ed,vf)
  local vmx,vmy=vtx(ed,(vf+1)%nl)
  local v3x,v3y=vtx(ed,(vf+2)%nl)
  local mx,my=(v1x+v3x)/2,(v1y+v3y)/2
  local dx,dy=cx-mx,cy-my
  local l=sqrt(dx*dx+dy*dy)
  local h=max(2,flr(7*s))
  if l>0 then dx,dy=dx/l*h,dy/l*h end
  local i1x,i1y=v1x+dx,v1y+dy
  local imx,imy=vmx+dx,vmy+dy
  local i3x,i3y=v3x+dx,v3y+dy
  line(v1x,v1y,vmx,vmy,c)
  line(vmx,vmy,v3x,v3y,c)
  line(imx,imy,i1x,i1y,c)
  line(i3x,i3y,imx,imy,c)
  line(v1x,v1y,i1x,i1y,c)
  line(v3x,v3y,i3x,i3y,c)
  local bd=min(nd,ed+.15)
  local b1x,b1y=vtx(bd,vf)
  local bmx,bmy=vtx(bd,(vf+1)%nl)
  local b3x,b3y=vtx(bd,(vf+2)%nl)
  local cmx,cmy=(b1x+b3x)/2,(b1y+b3y)/2
  local bx,by=cx-cmx,cy-cmy
  local bl=sqrt(bx*bx+by*by)
  local bh=max(2,flr(7*scl(bd)))
  if bl>0 then bx,by=bx/bl*bh,by/bl*bh end
  local bi1x,bi1y=b1x+bx,b1y+by
  local bimx,bimy=bmx+bx,bmy+by
  local bi3x,bi3y=b3x+bx,b3y+by
  line(i1x,i1y,b1x+bx,b1y+by,c)
  line(i3x,i3y,b3x+bx,b3y+by,c)
  line(bi1x,bi1y,bimx,bimy,bc)
  line(bimx,bimy,bi3x,bi3y,bc)

 elseif e.tp==3 then
  local c=e.hp==2 and 12 or 4
  local nx,ny,px,py=dirs(ex,ey)
  local br=max(2,flr(sz*.34))
  if e.hp==2 then
   local sp=max(br+1,sz*.78)
   local lx,ly=ex+px*sp,ey+py*sp
   local rx,ry=ex-px*sp,ey-py*sp
   draw_sph(lx,ly,br,c)
   draw_sph(rx,ry,br,c)
   local gap=max(1,br*.55)
   local cy1=ly-ny*gap
   local cy2=ly+ny*gap
   line(lx+px*br,cy1,rx-px*br,ry-ny*gap,c)
   line(lx+px*br,cy2,rx-px*br,ry+ny*gap,c)
   line(lx+px*(br*.55),ly+py*(br*.55),
        lx+px*(br*.95),ly+py*(br*.95),7)
   line(rx-px*(br*.55),ry-py*(br*.55),
        rx-px*(br*.95),ry-py*(br*.95),7)
  else
   draw_sph(ex,ey,br,c)
   local slen=br+max(2,sz*.2)
   line(ex+px*br,ey+py*br,ex+px*slen,ey+py*slen,c)
   line(ex+px*br+ny,ey+py*br-nx,
        ex+px*slen+ny,ey+py*slen-nx,c)
   circ(ex,ey,max(1,flr(br*.25)),7)
  end

 elseif e.tp==4 then
  local r=max(2,flr(sz*.45))
  draw_sph(ex,ey,r,10)
  circ(ex,ey,max(1,flr(r*.35)),15)
  for i=0,7 do
   local a=i/8
   local sc=i%2==0 and 15 or 10
   line(ex+cos(a)*r,ey+sin(a)*r,ex+cos(a)*(r*1.75),ey+sin(a)*(r*1.75),sc)
  end

 elseif e.tp==5 then
  local nx,ny,px,py=dirs(ex,ey)
  local r=sz*.55
  local tilt=.35
  local th=sz*.18
  local np=14
  local pts={}
  for i=0,np-1 do
   local t=i/np
   local u=sin(t)
   u=u*u*u
   local v=(13*cos(t)-5*cos(t*2)-2*cos(t*3)-cos(t*4))/16
   add(pts,{u=u*r,v=v*r*tilt})
  end
  -- back face
  local bx,by=ex+nx*th,ey+ny*th
  for i=1,np do
   local a=pts[i]
   local b=pts[i%np+1]
   line(bx+px*a.u+nx*a.v,by+py*a.u+ny*a.v,
        bx+px*b.u+nx*b.v,by+py*b.u+ny*b.v,14)
  end
  -- depth lines at key points
  local fx,fy=ex-nx*th,ey-ny*th
  for _,idx in pairs({1,4,8,11}) do
   local p=pts[idx]
   line(bx+px*p.u+nx*p.v,by+py*p.u+ny*p.v,
        fx+px*p.u+nx*p.v,fy+py*p.u+ny*p.v,14)
  end
  -- front partial arcs
  for _,pair in pairs({{1,4},{8,11}}) do
   local a=pts[pair[1]]
   local b=pts[pair[2]]
   line(fx+px*a.u+nx*a.v,fy+py*a.u+ny*a.v,
        fx+px*b.u+nx*b.v,fy+py*b.u+ny*b.v,14)
  end

 elseif e.tp==6 then
  local c=13
  if e.hf and e.hf>.3 then c=7 end
  local nx,ny,px,py=dirs(ex,ey)
  if e.dp>2 then
   draw_puck(ex,ey,sz,c,true)
   darc(ex+nx,ey+ny,sz*1.25,sz*.45,atan2(px,py),7,.08,.42,4)
   darc(ex+nx,ey+ny,sz*1.25,sz*.45,atan2(px,py),7,.58,.92,4)
  else
   draw_puck(ex,ey,sz,c)
  end

 elseif e.tp==7 then
  local r=max(2,flr(sz*.4))
  draw_sph(ex,ey,r,11)
  local nln=(vf+e.sdir+nl)%nl
  local ax,ay=fmp(ed,nln)
  local adx,ady=ax-ex,ay-ey
  local al=max(1,sqrt(adx*adx+ady*ady))
  adx,ady=adx/al,ady/al
  local ar=max(r+2,sz*1.15)
  local sx,sy=ex+adx*(r*.45),ey+ady*(r*.45)
  local tx,ty=ex+adx*ar,ey+ady*ar
  local ox,oy=-ady,adx
  local off=max(.75,r*.18)
  line(sx+ox*off,sy+oy*off,tx+ox*off,ty+oy*off,11)
  line(sx-ox*off,sy-oy*off,tx-ox*off,ty-oy*off,11)
  local hs=max(1.5,sz*.38)
  line(tx,ty,tx-adx*hs+ox*hs,ty-ady*hs+oy*hs,7)
  line(tx,ty,tx-adx*hs-ox*hs,ty-ady*hs-oy*hs,7)
  pset(tx,ty,7)
 end
end

function draw_blt(b)
 local vf=vln(b.ln)
 local prog=min(1,bt/6)
 local bd=b.pd+(b.dp-b.pd)*prog
 if bd<0 then return end
 local bx,by=fmp(bd,vf)
 local s=scl(bd)
 local sz=max(1,1.5*s)
 local fx,fy=cx-bx,cy-by
 local fl=max(1,sqrt(fx*fx+fy*fy))
 fx,fy=fx/fl,fy/fl
 local px,py=-fy,fx
 local tl=max(1.5,sz*2.8)
 line(bx-fx*tl,by-fy*tl,bx,by,3)
 line(bx-fx*(tl*.65),by-fy*(tl*.65),
      bx+px*sz*.35,by+py*sz*.35,11)
 line(bx-fx*(tl*.65),by-fy*(tl*.65),
      bx-px*sz*.35,by-py*sz*.35,11)
 local ns=sz*1.6
 line(bx+fx*ns,by+fy*ns,bx+px*sz*.45,by+py*sz*.45,7)
 line(bx+fx*ns,by+fy*ns,bx-px*sz*.45,by-py*sz*.45,7)
 line(bx,by,bx+px*sz*.6,by+py*sz*.6,11)
 line(bx,by,bx-px*sz*.6,by-py*sz*.6,11)
 pset(bx,by,7)
end

function draw_ship()
 if over then return end
 local x1,y1=vtx(0,0)
 local x2,y2=vtx(0,1)
 local mx=flr((x1+x2)/2+.5)
 local my=flr((y1+y2)/2+.5)
 rectfill(mx-5,my-1,mx+5,my+1,1)
 rect(mx-5,my-1,mx+5,my+1,11)
 line(mx-6,my+1,mx-2,my-3,11)
 line(mx+6,my+1,mx+2,my-3,11)
 line(mx-3,my+1,mx,my+4,1)
 line(mx+3,my+1,mx,my+4,1)
 rectfill(mx-2,my-5,mx+2,my-2,1)
 rect(mx-2,my-5,mx+2,my-2,11)
 rectfill(mx-1,my-10,mx+1,my-5,7)
 line(mx-1,my-10,mx+1,my-10,10)
 pset(mx,my-4,7)
 if fcd>1 then
  line(mx,my-10,mx,my-14,10)
  for i=0,2 do
   local a=rnd(1)
   local rl=3+rnd(2)
   line(mx,my-11,mx+cos(a)*rl,my-11+sin(a)*rl,i==0 and 7 or 10)
  end
 end
end

function draw_hud()
 print("score",1,1,3)
 print(getscore(),1,8,11)
 if mult>1 then
  print("x"..sub(tostr(flr(mult*10)/10),1,3),30,8,10)
 end
 local hx,hw,hh=78,48,5
 local hc=hp<=30 and 8 or 11
 print("health",hx,1,3)
 rect(hx,7,hx+hw,7+hh,hc)
 local nseg=ceil(hp/10)
 local sw=hw/10
 for i=0,nseg-1 do
  rect(hx+i*sw+1,8,hx+i*sw+sw-1,7+hh-1,hp<=30 and 8 or 3)
 end
 if whits==1 then
  print("warning",42,121,10)
 elseif whits>=2 then
  print("critical!",38,121,8)
 end
 local ndmg=0
 for i=0,5 do
  if dmgseg[i]>0 then ndmg+=1 end
 end
 if ndmg>0 and ndmg<4 then
  print("integrity low",28,114,10)
 elseif ndmg>=4 then
  print("integrity critical",18,114,8)
 end
end

function ctrprint(s,y,c)
 print(s,64-flr(#s*2),y,c)
end

function drawpanel(x1,y1,x2,y2,oc,ic)
 rectfill(x1,y1,x2,y2,0)
 rect(x1,y1,x2,y2,oc)
 rect(x1+2,y1+2,x2-2,y2-2,ic)
end

function draw_title_screen()
 draw_tunnel()
 local spin=elapsed*.035
 local hr=16+sin(elapsed*.9)*2
 for i=0,5 do
  local a1=i/6+spin
  local a2=(i+1)/6+spin
  line(cx+cos(a1)*hr,cy-6+sin(a1)*hr,
       cx+cos(a2)*hr,cy-6+sin(a2)*hr,3)
 end

 drawpanel(11,10,116,89,11,5)
 ctrprint("h e x a x",18,11)
 ctrprint("vector tunnel",31,3)
 ctrprint("shooter",39,3)

 line(26,50,102,50,1)
 ctrprint("rotate the tunnel",56,6)
 ctrprint("clear the lane",64,6)

 drawpanel(20,76,107,116,3,1)
 ctrprint("\139 \145  rotate",83,11)
 ctrprint("z/x  fire",92,11)
 if sin(elapsed*2)>.05 then
  ctrprint("press z or x",106,10)
 end
end

function draw_game_over_screen()
 drawpanel(14,18,113,76,8,2)
 ctrprint("game over",27,8)
 line(28,37,99,37,2)
 ctrprint("final score",43,3)
 ctrprint(getscore(),53,11)
 if sin(elapsed*2)>.05 then
  drawpanel(24,84,103,102,3,1)
  ctrprint("press z or x",90,11)
  ctrprint("to try again",96,6)
 end
end

function _draw()
 setpal()
 cls(0)

 if ttl then
  draw_title_screen()
  return
 end

 draw_tunnel()
 for d=nd,0,-1 do
  for e in all(ens) do
   if e.alive and flr(max(0,e.dp))==d then
    draw_ent(e)
   end
  end
  for b in all(bls) do
   if b.alive and flr(b.dp)==d then
    draw_blt(b)
   end
  end
 end
 draw_ship()

 for p in all(exps) do
  local c=p.c
  local hc=p.t>8 and 7 or c
  if p.t<5 then c=5 end
  local tl=sqrt(p.dx*p.dx+p.dy*p.dy)
  if p.t>6 and tl>.3 then
   local ln=2+(p.ln or 1.5)
   line(p.x,p.y,p.x-p.dx*ln,p.y-p.dy*ln,c)
  end
  if p.t>8 then
   local sx=sgn(p.dx)
   local sy=sgn(p.dy)
   line(p.x-sx,p.y,p.x+sx,p.y,hc)
   line(p.x,p.y-sy,p.x,p.y+sy,c)
  elseif p.t>4 then
   pset(p.x-sgn(p.dx),p.y-sgn(p.dy),hc)
  end
  pset(p.x,p.y,c)
 end

 draw_hud()

 if over then
  draw_game_over_screen()
 end
end

__gfx__
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
__sfx__
000200001805018050180001800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
000400000c6500c6500865006650046500265001650006500065000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
000300002465024650246001e6001e600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00020000307512c75128751247511f75118751127500a750000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
0003000024650246502465024600246001e6001e6001e60018600186001260012600126000c6000c6000c60006600066000060000000000000000000000000000000000000000000000000000000000000000000000
000500000c6500c6500c6500865008650086500465004650046500265002650026500065000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
