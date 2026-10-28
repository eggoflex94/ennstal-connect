import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const monitor=readFileSync(new URL('../src/error-monitor.js',import.meta.url),'utf8');
const center=readFileSync(new URL('../src/admin-error-center.js',import.meta.url),'utf8');
test('network endpoint strips query parameters and provides useful diagnostics',()=>{
 assert.match(monitor,/url\.origin \+ url\.pathname/);
 assert.match(monitor,/endpoint: safeEndpoint/);
 assert.match(monitor,/occurred_at: new Date\(\)\.toISOString\(\)/);
 assert.match(center,/ec-error-hint/);
});


test('network diagnostics keep absolute and legacy Supabase hosts and group one outage',async()=>{
 const vm=await import('node:vm');const {parse}=await import('@babel/parser');
 const ast=parse(monitor,{sourceType:'module'});
 const listener=ast.program.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.arguments[0]?.value==='ec:network-error').expression.arguments[1];
 const prefix=monitor.slice(0,monitor.indexOf('window.addEventListener("error"')).replace(/^import[^\n]+\n/,'');
 const reports=[];const context=vm.createContext({URL,location:{origin:'https://ennstal-connect.com'},navigator:{onLine:true},reports});
 vm.runInContext(prefix+'\nreport=async payload=>reports.push(payload);globalThis.networkListener='+monitor.slice(listener.start,listener.end)+';',context);
 const emit=(endpoint,kind='timeout',status=null)=>context.networkListener({detail:{endpoint,kind,status,method:'GET'}});
 emit('eqfvhgiyrofjscvimvrc.supabase.co/rest/v1/profile_visits?select=id');
 emit('https://eqfvhgiyrofjscvimvrc.supabase.co/rest/v1/news?token=hidden');
 emit('https://eqfvhgiyrofjscvimvrc.supabase.co/rest/v1/public_profile_updates');
 assert.equal(reports.length,1);assert.equal(reports[0].metadata.host,'eqfvhgiyrofjscvimvrc.supabase.co');
 assert.equal(reports[0].source,'https://eqfvhgiyrofjscvimvrc.supabase.co/rest/v1/profile_visits');
 emit('https://other.example/rest/v1/news');assert.equal(reports.length,2);
 emit('https://eqfvhgiyrofjscvimvrc.supabase.co/rest/v1/news','server',500);
 emit('https://eqfvhgiyrofjscvimvrc.supabase.co/rest/v1/profile_visits','server',500);
 assert.equal(reports.length,4);
});
