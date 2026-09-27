import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const W=1200,H=630;
const px=Buffer.alloc(W*H*4);
function color(hex){hex=hex.replace("#","");return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),255]}
const NAVY=color("#102a43"), NAVY2=color("#243746"), ORANGE=color("#ff5a1f"), ORANGE2=color("#ff8a00"), WHITE=color("#ffffff"), MUTED=color("#d9e4ec"), BORDER=color("#9ba9b4");
function set(x,y,c){if(x<0||y<0||x>=W||y>=H)return;const i=(y*W+x)*4;px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];px[i+3]=c[3]}
function rect(x,y,w,h,c){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)set(xx,yy,c)}
function roundRect(x,y,w,h,r,c){for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const dx=xx<r?r-xx:xx>=w-r?xx-(w-r-1):0;const dy=yy<r?r-yy:yy>=h-r?yy-(h-r-1):0;if(dx*dx+dy*dy<=r*r)set(x+xx,y+yy,c)}}
function circle(cx,cy,r,c){for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)set(cx+x,cy+y,c)}
function polygon(points,c){const ys=points.map(p=>p[1]);for(let y=Math.floor(Math.min(...ys));y<=Math.ceil(Math.max(...ys));y++){const hits=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!=(yj>y))hits.push(xi+(y-yi)*(xj-xi)/(yj-yi));}hits.sort((a,b)=>a-b);for(let k=0;k+1<hits.length;k+=2)for(let x=Math.ceil(hits[k]);x<=Math.floor(hits[k+1]);x++)set(x,y,c)}}
function star(cx,cy,r1,r2,c){const p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2===0?r1:r2;p.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r])}polygon(p,c)}
const font={
"A":["01110","10001","10001","11111","10001","10001","10001"],"B":["11110","10001","10001","11110","10001","10001","11110"],
"C":["01111","10000","10000","10000","10000","10000","01111"],"D":["11110","10001","10001","10001","10001","10001","11110"],
"E":["11111","10000","10000","11110","10000","10000","11111"],"G":["01111","10000","10000","10111","10001","10001","01111"],
"I":["11111","00100","00100","00100","00100","00100","11111"],"L":["10000","10000","10000","10000","10000","10000","11111"],
"M":["10001","11011","10101","10101","10001","10001","10001"],"N":["10001","11001","10101","10011","10001","10001","10001"],
"O":["01110","10001","10001","10001","10001","10001","01110"],"R":["11110","10001","10001","11110","10100","10010","10001"],
"S":["01111","10000","10000","01110","00001","00001","11110"],"T":["11111","00100","00100","00100","00100","00100","00100"],
"U":["10001","10001","10001","10001","10001","10001","01110"],"V":["10001","10001","10001","10001","01010","01010","00100"],
".":["00000","00000","00000","00000","00000","00110","00110"]," ":["00000","00000","00000","00000","00000","00000","00000"],
"-":["00000","00000","00000","11111","00000","00000","00000"]
};
function textWidth(t,s,spacing=s){return [...t].reduce((n,ch)=>n+5*s+spacing,0)-spacing}
function drawText(t,x,y,s,c,spacing=s){for(const ch0 of t){const ch=ch0.toUpperCase(),g=font[ch]||font[" "];for(let ry=0;ry<7;ry++)for(let rx=0;rx<5;rx++)if(g[ry][rx]==="1")rect(x+rx*s,y+ry*s,s,s,c);x+=5*s+spacing}}
rect(0,0,W,H,NAVY);
circle(1050,72,220,NAVY2);circle(72,606,255,NAVY2);
roundRect(82,132,166,166,28,BORDER);roundRect(91,141,148,148,24,NAVY2);roundRect(101,151,128,128,20,NAVY);star(165,215,50,22,WHITE);
drawText("ENNSTAL",292,170,15,ORANGE,9);
drawText("CONNECT",292,292,15,ORANGE2,9);
drawText("DEINE REGIONALE COMMUNITY.",96,390,8,WHITE,6);
drawText("REGIONAL. ECHT. GEMEINSAM.",96,492,5,MUTED,5);

function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function chunk(type,data){const t=Buffer.from(type);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc])}
const raw=Buffer.alloc((W*4+1)*H);
for(let y=0;y<H;y++){raw[y*(W*4+1)]=0;px.copy(raw,y*(W*4+1)+1,y*W*4,(y+1)*W*4)}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",zlib.deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);
const out=path.resolve("public/ennstal-connect-share-2026.png");
fs.writeFileSync(out,png);
console.log("Generated",out,png.length,"bytes");
