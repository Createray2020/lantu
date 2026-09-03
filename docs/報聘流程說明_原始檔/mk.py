from playwright.sync_api import sync_playwright
import pathlib
p = pathlib.Path("index.html").resolve().as_uri()
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page()
    pg.goto(p, wait_until="networkidle")
    pg.pdf(path="嵐途報聘流程說明.pdf", format="A4", print_background=True,
           margin={"top":"18mm","bottom":"16mm","left":"16mm","right":"16mm"},
           display_header_footer=True,
           header_template="<div></div>",
           footer_template='<div style="width:100%;font-size:7pt;color:#8a9aa8;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif;"><span>嵐途 LAN TU · 報聘流程說明</span><span class="pageNumber"></span></div>')
    b.close()
print("done")
