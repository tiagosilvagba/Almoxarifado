import csv,json,glob,os,hashlib
from collections import defaultdict
ROOT=os.path.dirname(os.path.dirname(__file__)); OUT=os.path.join(ROOT,'data'); os.makedirs(OUT,exist_ok=True)
def norm(s): return ' '.join(str(s or '').strip().lower().split())
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
 with open(path,encoding='utf-8-sig',errors='replace',newline='') as f: yield from csv.DictReader(f,delimiter=';')
def prepared(branch,local):
 try:l=int(float(str(local).replace(',','.')))
 except:return False
 return str(branch).strip()=='704' and (l==101 or l>599)
def main():
 items=defaultdict(lambda:{'history':[]})
 files=sorted(glob.glob(os.path.join(ROOT,'01 - Compras_Almox_Parte_*.CSV')))
 for path in files:
  for r in rows(path):
   code=str(pick(r,'CD Item','Código Item','Item')).strip()
   if not code:continue
   branch=str(pick(r,'CD Filial','Filial')).strip(); local=str(pick(r,'CD Local','CD Local Estoque')).strip()
   sc=str(pick(r,'SC','SC - Número','Solicitação')).strip(); of=str(pick(r,'OF','OF - Número')).strip()
   rec={'branchCode':branch,'branchName':pick(r,'Nome Filial','NM Filial'),'localCode':local,'area':'Alimentos preparados' if prepared(branch,local) else '',
    'sc':{'code':sc,'status':pick(r,'Status SC','SC - Status','Status'),'requesterName':pick(r,'Solicitante','SC - Solicitante'),'date':pick(r,'Data SC','SC - Data')},
    'of':{'code':of,'status':pick(r,'Status OF','OF - Status'),'supplier':pick(r,'Fornecedor','OF - Fornecedor'),'date':pick(r,'Data OF','OF - Data'),'deliveryDate':pick(r,'Data Entrega','OF - Data Entrega'),'requestedQuantity':num(pick(r,'Quantidade OF','OF - Quantidade','Qtd OF')),'deliveredQuantity':num(pick(r,'Quantidade Entregue','OF - Quantidade Entregue','Qtd Entregue')),'balance':num(pick(r,'Saldo OF','OF - Saldo','Saldo')),'unitValue':num(pick(r,'Valor Unitário','OF - Valor Unitário'))}}
   x=items[code];x['code']=code;x['name']=pick(r,'NM Item','Nome Item','Descrição Item');x['history'].append(rec)
 data={'schema':1,'items':list(items.values()),'sourceFiles':[os.path.basename(x) for x in files]}
 raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(); open(os.path.join(OUT,'compras-index.json'),'wb').write(raw)
 manifest={'schema':1,'files':{'compras':'data/compras-index.json'},'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
 with open(os.path.join(OUT,'manifest.json'),'w',encoding='utf8') as f:json.dump(manifest,f,ensure_ascii=False,separators=(',',':'))
 print('items',len(data['items']),'bytes',len(raw))
if __name__=='__main__':main()