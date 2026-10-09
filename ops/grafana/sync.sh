#!/bin/bash
# Push/pull Grafana dashboards as code. Reads creds from .env.grafana (git-ignored).
#   ./sync.sh push <dashboards/file.json>   upsert a dashboard from a repo file
#   ./sync.sh pull <uid> <dashboards/file.json>   fetch live dashboard back to disk
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env.grafana ] || { echo "missing .env.grafana"; exit 1; }
set -a; . ./.env.grafana; set +a
: "${GRAFANA_URL:?set GRAFANA_URL in .env.grafana}"
: "${GRAFANA_TOKEN:?set GRAFANA_TOKEN in .env.grafana}"
AUTH=(-H "Authorization: Bearer $GRAFANA_TOKEN" -H "Content-Type: application/json")
BASE="${GRAFANA_URL%/}"

cmd="${1:-}"
case "$cmd" in
  push)
    file="$2"
    # Wrap the bare dashboard model in the create/update envelope; overwrite by uid.
    body=$(node -e '
      const fs=require("fs");
      const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      const model=d.dashboard||d;            // accept bare model or already-wrapped
      model.id=null;                          // let Grafana match by uid
      process.stdout.write(JSON.stringify({dashboard:model, overwrite:true, message:"sync from repo"}));
    ' "$file")
    echo "$body" | curl -s "${AUTH[@]}" -X POST "$BASE/api/dashboards/db" -d @- | BASE="$BASE" node -e '
      let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);
      if(r.status==="success"){console.log("pushed:",r.uid,"v"+r.version,"->",process.env.BASE+r.url);}else{console.log("ERROR:",s);process.exit(1);}})'
    ;;
  pull)
    uid="$2"; file="$3"
    curl -s "${AUTH[@]}" "$BASE/api/dashboards/uid/$uid" | node -e '
      let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);
      if(!r.dashboard){console.log("ERROR:",s);process.exit(1);}
      const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify(r.dashboard,null,2)+"\n");
      console.log("pulled",r.dashboard.uid,"-> "+process.argv[1]);})' "$file"
    ;;
  test)
    curl -s -o /dev/null -w "GET /api/org -> HTTP %{http_code}\n" "${AUTH[@]}" "$BASE/api/org"
    ;;
  *) echo "usage: ./sync.sh {push <file>|pull <uid> <file>|test}"; exit 1;;
esac
