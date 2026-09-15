import csv,json,glob,os,hashlib,sys,unicodedata
from collections import Counter
ROOT=os.path.dirname(os.path.dirname(__file__));OUT=os.path.join(ROOT,'data');os.makedirs(OUT,exist_ok=True)
def norm(s):return ' '.join(unicodedata.normalize('NFD',str(s or '')).encode('ascii','ignore').decode().strip().lower().split())
def num(v):
 s=str(v or '').strip().replace(' ','')
 if ',' in s:s=s.replace('.','').replace(',','.')
 try:return float(s)
 except:return 0.0
def val(r,i):return str(r[i]).strip() if i<len(r) else ''
def prepared(branch,local):
 try:l=int(float(str(local).replace(',','.')))
 except:return False
 return str(branch).strip()=='704' and (l==101 or l>599)
def open_of(x):
 st=norm(x['status']);req=x['requested'];deliv=x['delivered'];bal=x['balance']
 if str(x['closed']).upper() in ('S','SIM','1','TRUE') and bal<=0:return False
 if any(k in st for k in ('fechad','encerrad','cancelad','finalizad','concluid')) and bal<=0:return False
 return bal>0 or (req>0 and deliv<req)
def dump(name,obj):
 raw=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode();open(os.path.join(OUT,name),'wb').write(raw);return len(raw),hashlib.sha256(raw).hexdigest()
def main():
 files=sorted(glob.glob(os.path.join(ROOT,'01 - Compras_Almox_Parte_*.CSV')));errors=[];warnings=[];total=ignored=prep=0;headers=[];scs=Counter();ofs=Counter();follow=[];sc_of=[]
 if len(files)!=4:errors.append(f'Esperadas 4 partes; encontradas {len(files)}')
 for path in files:
  with open(path,encoding='utf-8-sig',errors='replace',newline='') as f:
   rd=csv.reader(f,delimiter=';');h=next(rd,[]);headers.append(len(h))
   if len(h)<90:errors.append(f'{os.path.basename(path)} possui {len(h)} colunas; esperado >=90')
   for r in rd:
    total+=1;codes=[]
    for c in (val(r,11),val(r,44),val(r,84)):
     if c and c not in codes:codes.append(c)
    if not codes:ignored+=1;continue
    sc=val(r,0);of=val(r,32);branch=val(r,7) or val(r,75);local=val(r,26);isprep=prepared(branch,local)
    if isprep:prep+=1
    if sc:scs[sc]+=1
    if of:ofs[of]+=1
    ofx={'code':of,'status':val(r,60),'supplier':val(r,43),'deliveryDate':val(r,55),'requested':num(val(r,47)),'balance':num(val(r,48)),'delivered':num(val(r,49)),'unitValue':num(val(r,50)),'closed':val(r,51)}
    # Dataset de consulta SC/OF: somente campos usados pelos módulos, sem replicar histórico por item.
    if sc or of:sc_of.append([codes[0] if codes else '',sc,of,branch,local,val(r,1),val(r,60),val(r,43),val(r,3),val(r,55),num(val(r,15)),ofx['requested'],ofx['delivered'],ofx['balance'],ofx['unitValue'],val(r,27),val(r,10),1 if isprep else 0])
    if of and open_of(ofx):follow.append([codes[0] if codes else '',sc,of,branch,local,val(r,1),ofx['status'],ofx['supplier'],val(r,5),val(r,3),ofx['deliveryDate'],ofx['requested'],ofx['delivered'],ofx['balance'],ofx['unitValue'],1 if isprep else 0])
 if not total:errors.append('Nenhuma linha processada')
 if not scs:errors.append('Nenhuma SC identificada')
 if not ofs:errors.append('Nenhuma OF identificada')
 rawbytes=sum(os.path.getsize(x) for x in files)
 schema={'schema':5,'columns':['item','sc','of','filial','local','statusSC','statusOF','fornecedor','dataSC','dataEntrega','qtdSC','qtdOF','entregueOF','saldoOF','valorUnit','ccuEstoque','seqSC','preparados704'],'rows':sc_of}
 fups={'schema':5,'columns':['item','sc','of','filial','local','statusSC','statusOF','fornecedor','solicitante','dataSC','dataEntrega','qtdOF','entregueOF','saldoOF','valorUnit','preparados704'],'rows':follow}
 sizes={};hashes={}
 for name,obj in [('sc-of.json',schema),('follow-up.json',fups)]:sizes[name],hashes[name]=dump(name,obj)
 # Segurança: nenhum dataset derivado pode recriar o monólito de ~80 MB.
 for name,size in sizes.items():
  if size>25*1024*1024:errors.append(f'{name} excede 25 MB: {size} bytes')
 report={'ok':not errors,'schema':5,'csvSourcePreserved':True,'sourceParts':len(files),'sourceRows':total,'headerColumns':headers,'uniqueSC':len(scs),'uniqueOF':len(ofs),'followUpRows':len(follow),'prepared704Records':prep,'rowsWithoutProduct':ignored,'rawCsvBytes':rawbytes,'derivedBytes':sizes,'errors':errors,'warnings':warnings}
 dump('validation-report.json',report)
 manifest={'schema':5,'source':'CSV','sourceFiles':[os.path.basename(x) for x in files],'files':{'scOf':'data/sc-of.json','followUp':'data/follow-up.json','validation':'data/validation-report.json'},'bytes':sizes,'sha256':hashes,'validated':not errors}
 dump('manifest.json',manifest)
 print(json.dumps(report,ensure_ascii=False));sys.exit(1 if errors else 0)
if __name__=='__main__':main()
