// Append newly introduced source keys and status/error templates to the build catalog.
const fs=require('node:fs'),path=require('node:path'),b=require('next/dist/compiled/babel/bundle');const parser=b.parser(),traverse=b.traverse().default;
const root=path.resolve(__dirname,'..'),manifest=path.join(root,'locales/en.json'),keys=new Set(Object.keys(JSON.parse(fs.readFileSync(manifest,'utf8'))));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):/\.js$/.test(e.name)?[path.join(dir,e.name)]:[]);}
for(const file of [...files(path.join(root,'pages')),...files(path.join(root,'components')),...files(path.join(root,'hooks'))]){
 let ast; try { ast=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'module',plugins:['jsx']}); } catch(error) { console.error(path.relative(root,file)+': '+error.message); process.exit(1); } traverse(ast,{
 CallExpression(p){if(p.node.callee.name==='t'&&p.node.arguments[0]?.type==='StringLiteral')keys.add(p.node.arguments[0].value.replace(/\s+/g,' ').trim());},
 TemplateLiteral(p){let f=p.parentPath;if(!((f.isCallExpression()&&/^set(Error|Notice|Message|Feedback)$/.test(f.node.callee.name||''))||(f.isNewExpression()&&f.node.callee.name==='Error')))return;let key='';p.node.quasis.forEach((q,i)=>{key+=q.value.cooked;if(i<p.node.expressions.length)key+=`{value${i}}`;});if(/[A-Za-z]/.test(key))keys.add(key.replace(/\s+/g,' ').trim());}
 });
}
fs.writeFileSync(manifest,JSON.stringify(Object.fromEntries([...keys].sort().map(key=>[key,key])),null,2));console.log({sourceKeys:keys.size});
