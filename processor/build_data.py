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
 if any(x in st for x in ('fechad','encerrad','cancelad','finalizad','concluid')) and bal<=0:return False
 return bal>0 or (req>0 and delivered<req)
def main():
 files=sorted(glob.glob(os.path.join(ROOT,'01 - Compras_Almox_Parte_*.CSV'))); errors=[]; warnings=[]
 if len(files)!=4: errors.append(f'Esperadas 4 partes de compras; encontradas {len(files)}')
 items=defaultdict(lambda:{'history':[]}); total=0; empty_code=0; header_sets=[]; ofs=Counter(); scs=Counter(); prepared_count=0
 for path in files:
  first=True
  for headers,r in rows(path):
   if first:
    header_sets.append((os.path.basename(path),set(map(norm,headers)))); first=False
   total+=1; code=str(pick(r,'CD Item','Código Item','Item')).strip()
   if not code: empty_code+=1; continue
   branch=str(pick(r,'CD Filial','Filial')).strip(); local=str(pick(r,'CD Local','CD Local Estoque')).strip(); sc=str(pick(r,'SC','SC - Número','Solicitação')).strip(); of=str(pick(r,'OF','OF - Número')).strip()
   rec={'branchCode':branch,'branchName':pick(r,'Nome Filial','NM Filial'),'localCode':local,'area':'Alimentos preparados' if prepared(branch,local) else '', 'sc':{'code':sc,'status':pick(r,'Status SC','SC - Status','Status'),'requesterName':pick(r,'Solicitante','SC - Solicitante'),'date':pick(r,'Data SC','SC - Data')},'of':{'code':of,'status':pick(r,'Status OF','OF - Status'),'supplier':pick(r,'Fornecedor','OF - Fornecedor'),'date':pick(r,'Data OF','OF - Data'),'deliveryDate':pick(r,'Data Entrega','OF - Data Entrega'),'requestedQuantity':num(pick(r,'Quantidade OF','OF - Quantidade','Qtd OF')),'deliveredQuantity':num(pick(r,'Quantidade Entregue','OF - Quantidade Entregue','Qtd Entregue')),'balance':num(pick(r,'Saldo OF','OF - Saldo','Saldo')),'unitValue':num(pick(r,'Valor Unitário','OF - Valor Unitário'))}}
   if prepared(branch,local): prepared_count+=1
   if sc:scs[sc]+=1
   if of:ofs[of]+=1
   x=items[code];x['code']=code;x['name']=pick(r,'NM Item','Nome Item','Descrição Item');x['history'].append(rec)
 if not total:errors.append('Nenhuma linha de compras processada')
 if empty_code: warnings.append(f'{empty_code} linhas sem código de item foram ignoradas')
 if header_sets:
  common=set.intersection(*(x[1] for x in header_sets));
  if not any(x in common for x in ('cd item','codigo item','item')):errors.append('Coluna de item não identificada de forma consistente nas 4 partes')
 data={'schema':2,'items':list(items.values()),'sourceFiles':[os.path.basename(x) for x in files]}
 open_rows=[]
 for item in data['items']:
  for rec in item['history']:
   if open_of(rec['of']):open_rows.append((item,rec))
 if not open_rows:warnings.append('Nenhuma OF aberta detectada; revisar nomes das colunas antes de produção')
 raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(); open(os.path.join(OUT,'compras-index.json'),'wb').write(raw)
 report={'ok':not errors,'schema':2,'sourceParts':len(files),'sourceRows':total,'items':len(items),'uniqueSC':len(scs),'uniqueOF':len(ofs),'openOFRecords':len(open_rows),'prepared704Records':prepared_count,'emptyItemRows':empty_code,'generatedBytes':len(raw),'errors':errors,'warnings':warnings}
 with open(os.path.join(OUT,'validation-report.json'),'w',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
 manifest={'schema':2,'files':{'compras':'data/compras-index.json','validation':'data/validation-report.json'},'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'validated':not errors}
 with open(os.path.join(OUT,'manifest.json'),'w',encoding='utf8') as f:json.dump(manifest,f,ensure_ascii=False,separators=(',',':'))
 print(json.dumps(report,ensure_ascii=False)); sys.exit(1 if errors else 0)
if __name__=='__main__':main()