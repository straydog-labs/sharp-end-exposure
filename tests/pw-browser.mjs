import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { execSync } from 'child_process';

function chromeCandidates(dir){
  return [
    join(dir, 'chrome-linux', 'chrome'),
    join(dir, 'chrome-linux64', 'chrome'),
    join(dir, 'chrome-headless-shell'),
    join(dir, 'chrome-linux', 'headless_shell')
  ];
}

function findChromeInRoot(root){
  if(!root || !existsSync(root)) return null;
  var names;
  try{ names = readdirSync(root); }
  catch(e){ return null; }
  var full = names.filter(function(n){ return n.indexOf('chromium') === 0 && n.indexOf('headless') === -1; }).sort().reverse();
  var headless = names.filter(function(n){ return n.indexOf('chromium') === 0; }).sort().reverse();
  var dirs = full.concat(headless);
  var i, j, cand, list;
  for(i = 0; i < dirs.length; i++){
    list = chromeCandidates(join(root, dirs[i]));
    for(j = 0; j < list.length; j++){
      cand = list[j];
      if(existsSync(cand)) return cand;
    }
  }
  return null;
}

export function resolveChromiumPath(){
  var roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    process.env.HOME ? join(process.env.HOME, '.cache/ms-playwright') : null,
    '/home/ubuntu/.cache/ms-playwright'
  ];
  var i, exe;
  for(i = 0; i < roots.length; i++){
    exe = findChromeInRoot(roots[i]);
    if(exe) return exe;
  }
  return null;
}

export function loadPlaywright(){
  var candidates = [
    join(process.cwd(), 'node_modules/playwright'),
    '/tmp/pw-log-attempt/node_modules/playwright'
  ];
  var i;
  for(i = 0; i < candidates.length; i++){
    if(existsSync(candidates[i])) return createRequire(candidates[i] + '/package.json')('playwright');
  }
  try{
    return createRequire(import.meta.url)('playwright');
  }catch(e){}
  execSync('npm install --silent --no-fund --no-audit playwright@1.55.0 --prefix /tmp/pw-log-attempt', {
    stdio: 'inherit'
  });
  return createRequire('/tmp/pw-log-attempt/node_modules/playwright/package.json')('playwright');
}

export async function launchChromium(){
  var playwright = loadPlaywright();
  var exe = resolveChromiumPath();
  if(exe){
    return playwright.chromium.launch({ headless: true, executablePath: exe });
  }
  try{
    return await playwright.chromium.launch({ headless: true });
  }catch(first){
    execSync('npx --yes playwright@1.55.0 install chromium', { stdio: 'inherit' });
    return playwright.chromium.launch({ headless: true });
  }
}
