import csv,json,glob,os,hashlib,sys,unicodedata
from collections import defaultdict,Counter
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
def open_of(of):
 st=norm(of['status']);req=num(of['requestedQuantity']);deliv=num(of['deliveredQuantity']);bal=num(of['balance'])
 if str(of['closed']).upper() in ('S','SIM','1','TRUE') and bal<=0:return False
 if any(x in st for x in ('fechad','encerrad','cancelad','finalizad','concluid')) and bal<=0:return False
 return bal>0 or (req>0 and deliv<req)
def main():
 files=sorted(glob.glob(os.path.join(ROOT,'01 - Compras_Almox_Parte_*.CSV')));errors=[];warnings=[];items=defaultdict(lambda:{'history':[]});scs=Counter();ofs=Counter();total=ignored=prep=0;header_counts=[]
 if len(files)!=4:errors.append(f'Esperadas 4 partes; encontradas {len(files)}')
 for path in files:
  with open(path,encoding='utf-8-sig',errors='replace',newline='') as f:
   rd=csv.reader(f,delimiter=';');headers=next(rd,[]);header_counts.append(len(headers))
   if len(headers)<90:errors.append(f'{os.path.basename(path)} possui apenas {len(headers)} colunas; esperado >=90')
   for r in rd:
    total+=1
    # Layout oficial atual: SC produto=11, OF produto=44, REC produto=84.
    codes=[]
    for c in (val(r,11),val(r,44),val(r,84)):
     if c and c not in codes:codes.append(c)
    if not codes:ignored+=1;continue
    sc=val(r,0);of=val(r,32);branch=val(r,7) or val(r,75);local=val(r,26)
    rec={'branchCode':branch,'branchName':val(r,8) or val(r,76),'localCode':local,'area':'Alimentos preparados' if prepared(branch,local) else '',
     'sc':{'code':sc,'status':val(r,1),'requesterName':val(r,5),'date':val(r,3),'sequence':val(r,10),'quantity':num(val(r,15)),'ccuStock':val(r,27),'cancelled':val(r,25)},
     'of':{'code':of,'status':val(r,60),'supplier':val(r,43),'date':val(r,33),'deliveryDate':val(r,55),'requestedQuantity':num(val(r,47)),'balance':num(val(r,48)),'deliveredQuantity':num(val(r,49)),'unitValue':num(val(r,50)),'closed':val(r,51),'blocked':val(r,52)}}
    if prepared(branch,local):prep+=1
    if sc:scs[sc]+=1
    if of:ofs[of]+=1
    for code in codes:
     x=items[code];x['code']=code;x['name']=val(r,12) or val(r,45) or val(r,85);x['history'].append(rec)
 if not total:errors.append('Nenhuma linha processada')
 if not items:errors.append('Nenhum item identificado')
 if not scs:errors.append('Nenhuma SC identificada')
 if not ofs:errors.append('Nenhuma OF identificada')
 open_count=sum(1 for i in items.values() for r in i['history'] if r['of']['code'] and open_of(r['of']))
 if not open_count:warnings.append('Nenhuma OF aberta detectada')
 raw_source=sum(os.path.getsize(x) for x in files);data={'schema':4,'items':list(items.values()),'sourceFiles':[os.path.basename(x) for x in files]};raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()
 # Monolito acima de 60 MB não será aprovado para iOS/produção.
 if len(raw)>60*1024*1024:errors.append(f'JSON gerado ainda muito grande para publicação segura: {len(raw)} bytes')
 report={'ok':not errors,'schema':4,'sourceParts':len(files),'sourceRows':total,'headerColumns':header_counts,'items':len(items),'uniqueSC':len(scs),'uniqueOF':len(ofs),'openOFRecords':open_count,'prepared704Records':prep,'rowsWithoutProduct':ignored,'generatedBytes':len(raw),'rawBytes':raw_source,'reductionPct':round((1-len(raw)/raw_source)*100,2),'errors':errors,'warnings':warnings}
 with open(os.path.join(OUT,'validation-report.json'),'w',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
 if not errors:open(os.path.join(OUT,'compras-index.json'),'wb').write(raw)
 manifest={'schema':4,'files':{'compras':'data/compras-index.json','validation':'data/validation-report.json'},'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'validated':not errors}
 with open(os.path.join(OUT,'manifest.json'),'w',encoding='utf8') as f:json.dump(manifest,f,ensure_ascii=False,separators=(',',':'))
 print(json.dumps(report,ensure_ascii=False));sys.exit(1 if errors else 0)
if __name__=='__main__':main()
