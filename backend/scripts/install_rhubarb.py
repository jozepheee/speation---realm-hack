"""Install the pinned Windows Rhubarb release without running downloaded code."""
import hashlib,io,shutil,sys,tempfile,urllib.request,zipfile
from pathlib import Path
URL='https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.14.0/Rhubarb-Lip-Sync-1.14.0-Windows.zip'
SHA256='62fa416a8d5e382a3828ee4bef358ce520d0b4cabdeaea75a7ac266d098d1fe3'
def install(destination):
 destination=Path(destination).resolve()
 if destination.exists():raise ValueError('Choose a new install directory; existing files are never replaced')
 with urllib.request.urlopen(URL,timeout=60) as response:data=response.read(100*1024*1024+1)
 if len(data)>100*1024*1024 or hashlib.sha256(data).hexdigest()!=SHA256:raise ValueError('Release size or digest mismatch')
 with tempfile.TemporaryDirectory(prefix='speation-rhubarb-') as temporary:
  root=Path(temporary).resolve()
  with zipfile.ZipFile(io.BytesIO(data)) as archive:
   for member in archive.infolist():
    target=(root/member.filename).resolve()
    if not target.is_relative_to(root):raise ValueError('Unsafe release path')
   archive.extractall(root)
  source=root/'Rhubarb-Lip-Sync-1.14.0-Windows'
  if not (source/'rhubarb.exe').is_file():raise ValueError('Executable missing from release')
  shutil.copytree(source,destination)
 print('Set RHUBARB_PATH to '+str(destination/'rhubarb.exe'))
if __name__=='__main__':
 if len(sys.argv)!=2:raise SystemExit('Usage: python backend/scripts/install_rhubarb.py NEW_INSTALL_DIRECTORY')
 install(sys.argv[1])
