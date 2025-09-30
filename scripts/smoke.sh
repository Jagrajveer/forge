# scripts/smoke.sh
set -euo pipefail
npm ci
npm run build

echo "== env/auth =="
npx forge env doctor
npx forge auth test

echo "== memory =="
mkdir -p .forge
echo "TAG: SENTINEL42" >> .forge/MEMORY.md
npm run build
node -e "import('./dist/core/prompts/system.js').then(m=>{const ok=m.systemPrompt('plan').includes('SENTINEL42'); if(!ok) process.exit(2); console.log('MEMORY_OK');});"

echo "== chat/create file =="
rm -f test.txt
printf "you ... create a file named test.txt\n" | npx forge chat --verify both --trace plan
test -f test.txt

echo "== changes summarizer =="
echo "// tweak" >> test.txt
npx forge changes

echo "== lint =="
npm run lint

echo "ALL GREEN"
