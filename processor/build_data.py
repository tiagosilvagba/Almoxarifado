import csv,json,glob,os,hashlib,sys,unicodedata
from collections import defaultdict,Counter
ROOT=os.path.dirname(os.path.dirname(__file__)); OUT=os.path.join(ROOT,'data'); os.makedirs(OUT,exist_ok=True)
def norm(s): return ' '.join(unicodedata.normalize('NFD',str(s or '')).encode('ascii','ignore').decode().strip().lower().split())
def pick(r,*names):
 m={norm(k):v for k,v in r.items()}
 for n in names:
  v=m.get(norm(n),'')
  if v not in ('',None): return v
 return ''
def num(v):
 s=str(v or '').strip().replace(' ','')
 if ',' in s:s=s.replace('.','').replace(',','.')
 try:return float(s)
 except:return 0.0
def rows(path):
 with open(path,encoding='utf-8-sig',errors='replace',newline='') as f:
  rd=csv.DictReader(f,delimiter=';'); headers=rd.fieldnames or []
  for r in rd: yield headers,r
def prepared(branch,local):
 try:l=int(float(str(local).replace(',','.')))
 except:return False
 return str(branch).strip()=='704' and (l==101 or l>599)
def open_of(of):
 st=norm(of.get('status')); req=num(of.get('requestedQuantity')); delivered=num(of.get('deliveredQuantity')); bal=num(of.get('balance'))
 if str(of.get('closed','')).strip().lower() in ('1','sim','s','true','yes') and bal<=0:return False
 if any(x in st for x in ('fechad','encerrad','cancelad','finalizad','concluid')) and bal<=0:return False
 return bal>0 or (req>0 and delivered<req)
def main():
 files=sorted(glob.glob(os.path.join(ROOT,'01 - Compras_Almox_Parte_*.CSV'))); errors=[]; warnings=[]
 if len(files)!=4:errors.append(f'Esperadas 4 partes de compras; encontradas {len(files)}')
 items=defaultdict(lambda:{'history':[]}); total=0; ignored=0; header_sets=[]; ofs=Counter();scs=Counter();prepared_count=0
 for path in files:
  first=True
  for headers,r in rows(path):
   if first:header_sets.append((os.path.basename(path),set(map(norm,headers))));first=False
   total+=1
   codes=[]
   for c in (pick(r,'SC - Cód. Produto'),pick(r,'OF - Cód. Produto'),pick(r,'REC - Cód Produto')):
    c=str(c).strip()
    if c and c not in codes:codes.append(c)
   if not codes:ignored+=1;continue
   sc=str(pick(r,'SC - Código')).strip();of=str(pick(r,'OF - Codigo','OF - Código')).strip();branch=str(pick(r,'SC - Filial','REC - Filial')).strip();local=str(pick(r,'SC - Local Estoque','SC - Local de estoque')).strip()
   rec={'branchCode':branch,'branchName':pick(r,'SC - Descr. Filial','REC - Nome Filial'),'localCode':local,'area':'Alimentos preparados' if prepared(branch,local) else '',
    'sc':{'code':sc,'status':pick(r,'SC - Situação'),'requesterName':pick(r,'SC - Nome Solicitante'),'date':pick(r,'SC - Data Criação'),'sequence':pick(r,'SC - Seq.'),'quantity':num(pick(r,'SC - Quantidade')),'ccuStock':pick(r,'SC - CCU Etq'),'cancelled':pick(r,'SC - Cancelado')},
    'of':{'code':of,'status':pick(r,'OF - Situação OF'),'supplier':pick(r,'REC - Fornecedor','OF - Nome Fornecedor'),'date':pick(r,'OF - Data'),'deliveryDate':pick(r,'OF - Data Entrega'),'requestedQuantity':num(pick(r,'OF - Qtd. Solicitada')),'deliveredQuantity':num(pick(r,'OF - Qtd. Entregue')),'balance':num(pick(r,'OF - Saldo')),'unitValue':num(pick(r,'OF - Valor')),'closed':pick(r,'OF - Fechado'),'blocked':pick(r,'OF - Bloqueado')}}
   if prepared(branch,local):prepared_count+=1
   if sc:scs[sc]+=1
   if of:ofs[of]+=1
   for code in codes:
    x=items[code];x['code']=code;x['name']=pick(r,'SC - Nome Produto','OF - Nome Produto');x['history'].append(rec)
 if not total:errors.append('Nenhuma linha processada')
 if not items:errors.append('Nenhum item identificado pelos campos reais SC/OF/REC')
 if header_sets:
  common=set.intersection(*(x[1] for x in header_sets));required_groups=[('produto',{'sc - cod. produto','of - cod. produto','rec - cod produto'}),('sc',{'sc - codigo'}),('of',{'of - codigo'})]
  for label,aliases in required_groups:
   if not common.intersection(aliases):warnings.append(f'Campo {label} não é comum às quatro partes ou usa variante de cabeçalho')
 open_rows=[(i,r) for i in items.values() for r in i['history'] if r['of']['code'] and open_of(r['of'])]
 if not ofs:errors.append('Nenhuma OF identificada')
 if not scs:errors.append('Nenhuma SC identificada')
 if not open_rows:warnings.append('Nenhuma OF aberta detectada')
 data={'schema':3,'items':list(items.values()),'sourceFiles':[os.path.basename(x) for x in files]};raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode();open(os.path.join(OUT,'compras-index.json'),'wb').write(raw)
 report={'ok':not errors,'schema':3,'sourceParts':len(files),'sourceRows':total,'items':len(items),'uniqueSC':len(scs),'uniqueOF':len(ofs),'openOFRecords':len(open_rows),'prepared704Records':prepared_count,'rowsWithoutProduct':ignored,'generatedBytes':len(raw),'compressionVsRawPct':round((1-len(raw)/sum(os.path.getsize(x) for x in files))*100,2),'errors':errors,'warnings':warnings}
 with open(os.path.join(OUT,'validation-report.json'),'w',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
 manifest={'schema':3,'files':{'compras':'data/compras-index.json','validation':'data/validation-report.json'},'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'validated':not errors}
 with open(os.path.join(OUT,'manifest.json'),'w',encoding='utf8') as f:json.dump(manifest,f,ensure_ascii=False,separators=(',',':'))
 print(json.dumps(report,ensure_ascii=False));sys.exit(1 if errors else 0)
if __name__=='__main__':main()