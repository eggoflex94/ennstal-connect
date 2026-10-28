export const DEFAULT_BLOCK_STYLE = { width:100, minHeight:0, fontSize:15, color:'#293746', background:'#f1f3f5', borderColor:'#cbd1d8', radius:20, padding:18, fontFamily:'system', align:'left', order:0 };
const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const color=(value,fallback)=>/^#[a-f\d]{6}$/i.test(value||'')?value:fallback;
export function normalizeBlock(input={}) {
 const d=DEFAULT_BLOCK_STYLE;
 return { width:clamp(input.width,25,100,d.width),minHeight:clamp(input.minHeight,0,1200,0),fontSize:clamp(input.fontSize,10,48,d.fontSize),
 color:color(input.color,d.color),background:color(input.background,d.background),borderColor:color(input.borderColor,d.borderColor),
 radius:clamp(input.radius,0,40,d.radius),padding:clamp(input.padding,0,60,d.padding),order:clamp(input.order,-1000,1000,0),
 fontFamily:['system','serif','mono'].includes(input.fontFamily)?input.fontFamily:'system',align:['left','center','right'].includes(input.align)?input.align:'left',
 title:typeof input.title==='string'?input.title.slice(0,180):'',text:typeof input.text==='string'?input.text.slice(0,12000):'',custom:input.custom===true,textOverride:input.textOverride===true };
}
export function blockKey(node, index=0) {
 if(node.dataset.pageBlock)return node.dataset.pageBlock;
 if(node.id)return `id:${node.id}`;
 const classes=[...node.classList].filter(c=>!c.startsWith('ec-design-')).sort().join('.');
 return `${node.tagName.toLowerCase()}:${classes||'block'}:${index}`.slice(0,180);
}
export function discoverPageBlocks(root) {
 if(!root)return [];
 const candidates=[...root.querySelectorAll('.panel,.page-heading,.ec-team-panel,.ec-magazine-hero,.ec-magazine-categories,.ec-magazine-events,.ec-magazine-content,[data-page-block],:scope > section > section,:scope > section > article')]
 .filter(n=>!n.closest('form,.ec-design-studio,.ec-member-hover-preview,.member-card,.chat-box,.admin-member-cards,.ec-cover-live-preview,.ec-magazine-editor,.ec-cover-preview-canvas,.homepage-editor-toggle'));
 const selected=candidates.filter(n=>!candidates.some(other=>other!==n&&other.contains(n)));
 if(!selected.length)selected.push(...root.querySelectorAll(':scope > section'));
 const counts=new Map();
 return selected.map(node=>{const base=blockKey(node,0),index=counts.get(base)||0;counts.set(base,index+1);return {node,key:blockKey(node,index),label:node.querySelector('h1,h2,h3,h4')?.textContent?.trim()||node.getAttribute('aria-label')||`Bereich ${selected.indexOf(node)+1}`};});
}
export function moveBlock(blocks,key,direction) {
 const sorted=[...blocks].sort((a,b)=>(a.order||0)-(b.order||0));const i=sorted.findIndex(b=>b.key===key);const j=i+direction;
 if(i<0||j<0||j>=sorted.length)return sorted;
 [sorted[i],sorted[j]]=[sorted[j],sorted[i]];
 return sorted.map((b,index)=>({...b,order:index}));
}
