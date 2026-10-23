"""Optional local PowerPoint rendering; no cloud upload or macro execution."""
import io,os,subprocess,sys,tempfile,zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def render_pdf(data):
    if os.name!='nt':return None
    with tempfile.TemporaryDirectory(prefix='speation-slides-') as directory:
        source=Path(directory)/'slides.pptx';output=Path(directory)/'slides.pdf'
        # Remove external references from the rendering copy; never execute embedded objects.
        with zipfile.ZipFile(io.BytesIO(data)) as original,zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED) as clean:
            for entry in original.infolist():
                if any(part in entry.filename.lower() for part in ['vbaproject','activex/','embeddings/']):return None
                content=original.read(entry)
                if entry.filename.endswith('.rels'):
                    root=ET.fromstring(content)
                    for relationship in list(root):
                        if relationship.get('TargetMode')=='External':root.remove(relationship)
                    content=ET.tostring(root,encoding='utf-8',xml_declaration=True)
                clean.writestr(entry,content)
        try:
            completed=subprocess.run([sys.executable,str(Path(__file__).resolve()),str(source),str(output)],
                timeout=40,capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
            if completed.returncode or not output.exists() or output.stat().st_size>30*1024*1024:return None
            return output.read_bytes()
        except (OSError,subprocess.TimeoutExpired):return None


def worker(source,output):
    # Avoid sharing or closing an existing user PowerPoint instance.
    processes=subprocess.run(['tasklist','/FI','IMAGENAME eq POWERPNT.EXE','/FO','CSV','/NH'],capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW,timeout=5)
    if 'powerpnt.exe' in processes.stdout.lower():return 2
    import pythoncom,win32com.client
    pythoncom.CoInitialize();application=None;presentation=None
    try:
        application=win32com.client.DispatchEx('PowerPoint.Application');application.AutomationSecurity=3
        presentation=application.Presentations.Open(str(Path(source).resolve()),ReadOnly=True,Untitled=False,WithWindow=False)
        presentation.SaveAs(str(Path(output).resolve()),32)
        return 0
    finally:
        if presentation:presentation.Close()
        if application and application.Presentations.Count==0:application.Quit()
        pythoncom.CoUninitialize()


if __name__=='__main__':
    sys.exit(worker(*sys.argv[1:3]))
