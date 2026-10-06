import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
const out=path.resolve('.sites-runtime/validation');
const source=await fs.readFile('components/article-body.tsx','utf8');
await fs.writeFile(path.join(out,'article-body.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText);
const {ArticleBody}=await import(path.join(out,'article-body.mjs'));
const markup=renderToStaticMarkup(React.createElement(ArticleBody,{body:'## Заголовок\nАбзац без пустой строки.\n- Пункт\n- Ещё пункт\n\n<script>alert(1)</script>'}));
assert.match(markup,/<h2>Заголовок<\/h2><p>Абзац без пустой строки\.<\/p><ul>/);
assert.ok(!markup.includes('<script>'));assert.match(markup,/&lt;script&gt;/);
const {seedArticles}=await import(path.join(out,'blog.mjs'));for(const a of seedArticles){const html=renderToStaticMarkup(React.createElement(ArticleBody,{body:a.body}));assert.ok(html.includes('<h2>')&&html.includes('<p>'));}
const report=JSON.parse(await fs.readFile('reports/routes.json','utf8'));const routes=new Set(report.routes);let links=0;
for(const folder of ['components','data','app']){async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='ui')await walk(f);}else if(/\.(tsx?|json)$/.test(f)){const s=await fs.readFile(f,'utf8');for(const m of s.matchAll(/(?:href\s*[:=]\s*["'])(\/[a-zA-Z0-9/?=&.#_-]*)(["'])/g)){const url=m[1].split(/[?#]/)[0];if(url.startsWith('/api/')||url.endsWith('/'))continue;if(/^\/(downloads|assets|fonts)\//.test(url))await fs.access('public'+url);else assert.ok(routes.has(url),f+' has unknown route '+url);links++;}}}}await walk(folder);}
assert.equal(new Set(seedArticles.map(a=>a.slug)).size,seedArticles.length);
const result={date:'2026-10-06',articleRenderChecks:seedArticles.length+2,literalLinksChecked:links,knownRoutes:routes.size,passed:true,scope:'Source render and literal link destinations, not browser interaction'};
await fs.writeFile('reports/content-tests.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
