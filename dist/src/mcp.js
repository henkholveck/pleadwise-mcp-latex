import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "./config.js";
import { currentUser } from "./context.js";
import { authChallenge } from "./auth.js";
import { getCourt, listCourts } from "./courts.js";
import { getEntitlement, UpgradeRequiredError } from "./entitlements.js";
import { analyzeDocument, buildFormattedDocument, checkFilingPackage, createExport, createFormattedDocument, getFormattedDocument, previewHtml, } from "./documents.js";
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const createsArtifact = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const PREVIEW_URI = "ui://pleadwise/preview.html";
export function createMcpServer() {
    const server = new McpServer({ name: "pleadwise", version: "0.1.0" }, { instructions: "Pleadwise formats user-provided legal filings; it does not provide legal advice. Start with analyze_document, confirm or select the court with get_court_format, then preview. Full formatting and export require an active Pleadwise entitlement. Preserve the user's legal substance." });
    server.registerResource("pleadwise-preview", PREVIEW_URI, {}, async () => ({
        contents: [{
                uri: PREVIEW_URI,
                mimeType: "text/html;profile=mcp-app",
                text: previewWidgetHtml,
                _meta: {
                    "openai/widgetCSP": {
                        connect_domains: [config.PUBLIC_BASE_URL],
                        resource_domains: [config.PUBLIC_BASE_URL],
                    },
                    "openai/widgetPrefersBorder": false,
                    "openai/widgetDomain": config.PUBLIC_BASE_URL,
                    ui: {
                        prefersBorder: false,
                        domain: config.PUBLIC_BASE_URL,
                        csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
                    },
                },
            }],
    }));
    server.registerTool("analyze_document", {
        title: "Analyze legal filing",
        description: "Audit pasted or extracted filing text, identify likely document type and court, and flag structural omissions. Available without a paid entitlement.",
        inputSchema: { document_text: z.string().min(1).describe("Plain text extracted from an uploaded filing, or text pasted by the user.") },
        annotations: readOnly,
    }, async ({ document_text }) => result(analyzeDocument(document_text), "Document audit complete."));
    server.registerTool("get_court_format", {
        title: "Get court formatting profile",
        description: "Retrieve a court-formatting baseline. Use the court ID returned by analyze_document, or a user-selected court name. Always tell the user to confirm current local and judge-specific rules.",
        inputSchema: { court: z.string().optional().describe("Court ID or court name. Omit to list the supported MVP profiles.") },
        annotations: readOnly,
    }, async ({ court }) => result(court ? { court: getCourt(court) } : { courts: listCourts() }, court ? "Court profile found." : "Supported MVP court profiles."));
    server.registerTool("format_document", {
        title: "Format legal filing",
        description: "Apply the selected court profile to the complete filing while preserving the user's wording. Requires an active Pleadwise plan or Case Pass.",
        inputSchema: {
            document_text: z.string().min(1),
            court_id: z.string().optional(),
            title: z.string().max(200).optional(),
        },
        annotations: createsArtifact,
    }, async ({ document_text, court_id, title }) => protect("Full formatting", async (user) => {
        const entitlement = await getEntitlement(user);
        if (!entitlement.canFormat)
            throw new UpgradeRequiredError("Full formatting");
        const record = createFormattedDocument({ userId: user.id, documentText: document_text, courtId: court_id, title });
        return result({ formatId: record.id, title: record.title, court: record.court, entitlement }, "The filing is formatted and ready to preview or export.");
    }));
    server.registerTool("render_preview", {
        title: "Render filing preview",
        description: "Render an HTML preview. Free users receive a watermarked, truncated basic preview; entitled users can preview a full formatted document by format ID.",
        inputSchema: {
            document_text: z.string().min(1).optional().describe("Use for a free basic preview."),
            format_id: z.string().uuid().optional().describe("Use after format_document for the full preview."),
            court_id: z.string().optional(),
            title: z.string().max(200).optional(),
        },
        annotations: readOnly,
        _meta: {
            ui: { resourceUri: PREVIEW_URI },
            "openai/outputTemplate": PREVIEW_URI,
            "openai/toolInvocation/invoking": "Rendering filing preview…",
            "openai/toolInvocation/invoked": "Filing preview ready.",
        },
    }, async ({ document_text, format_id, court_id, title }) => {
        const user = currentUser();
        let record;
        let basic = true;
        if (format_id) {
            if (!user)
                return authenticationResult("Sign in to view this full Pleadwise preview.");
            record = getFormattedDocument(format_id, user.id);
            const entitlement = await getEntitlement(user);
            basic = !entitlement.canFormat;
        }
        else {
            if (!document_text)
                return errorResult("Provide document_text or format_id.");
            record = buildFormattedDocument({ userId: user?.id ?? "anonymous-preview", documentText: document_text, courtId: court_id, title });
            basic = !(user && (await getEntitlement(user)).canFormat);
        }
        const html = previewHtml(record, basic);
        return {
            structuredContent: { formatId: basic ? null : record.id, basic, court: record.court, previewHtml: html },
            content: [
                { type: "text", text: basic ? "Basic Pleadwise preview rendered. Full formatting and export require an active entitlement." : "Full Pleadwise preview rendered." },
                { type: "resource", resource: { uri: `ui://pleadwise/preview/${record.id}`, mimeType: "text/html", text: html } },
            ],
            _meta: { previewHtml: html },
        };
    });
    server.registerTool("export_document", {
        title: "Export legal filing",
        description: "Export a previously formatted filing as DOCX or PDF. Requires an active Pleadwise plan or Case Pass.",
        inputSchema: { format_id: z.string().uuid(), file_type: z.enum(["docx", "pdf"]) },
        annotations: createsArtifact,
    }, async ({ format_id, file_type }) => protect("Document export", async (user) => {
        const entitlement = await getEntitlement(user);
        if (!entitlement.canExport)
            throw new UpgradeRequiredError("Document export");
        const record = getFormattedDocument(format_id, user.id);
        const artifact = await createExport(record, file_type);
        const downloadUrl = `${config.PUBLIC_BASE_URL}/artifacts/${artifact.id}`;
        return result({ filename: artifact.filename, mimeType: artifact.mimeType, downloadUrl, expiresAt: new Date(artifact.expiresAt).toISOString() }, `Your ${file_type.toUpperCase()} export is ready. The private download link expires shortly.`);
    }));
    server.registerTool("check_filing_package", {
        title: "Check filing package",
        description: "Check the main filing and named attachments for common package components. This is a completeness aid, not a legal sufficiency review.",
        inputSchema: { document_text: z.string().min(1), attachment_names: z.array(z.string().max(200)).max(100).optional() },
        annotations: readOnly,
    }, async ({ document_text, attachment_names }) => result(checkFilingPackage({ documentText: document_text, attachments: attachment_names }), "Filing-package check complete."));
    return server;
}
async function protect(label, operation) {
    const user = currentUser();
    if (!user)
        return authenticationResult(`${label} requires sign-in to Pleadwise.`);
    try {
        return await operation(user);
    }
    catch (error) {
        if (error instanceof UpgradeRequiredError) {
            return {
                isError: true,
                structuredContent: { code: "entitlement_required" },
                content: [{
                        type: "text",
                        text: `${error.message} requires an existing eligible Pleadwise entitlement. Purchases are not offered through this plugin.`,
                    }],
            };
        }
        return errorResult(error instanceof Error ? error.message : "Pleadwise request failed");
    }
}
function result(data, message) {
    return { structuredContent: data, content: [{ type: "text", text: message }] };
}
function errorResult(message) {
    return { isError: true, content: [{ type: "text", text: message }] };
}
function authenticationResult(message) {
    return {
        isError: true,
        content: [{ type: "text", text: message }],
        _meta: { "mcp/www_authenticate": [authChallenge] },
    };
}
const previewWidgetHtml = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
html,body{margin:0;min-height:100%;background:#e8e4dc}
#root{min-height:240px}
.msg{padding:32px;color:#4b514d;font:14px system-ui,sans-serif}
.msg.error{color:#8a2f2f}
.diag{padding:16px 32px;color:#4b514d;font:12px ui-monospace,Menlo,monospace;white-space:pre-wrap}
iframe.sheet{display:block;width:100%;border:0;background:#e8e4dc}
</style></head>
<body><div id="root"><div class="msg">Preparing Pleadwise preview...</div></div>
<script>
(function(){
  var root=document.getElementById('root');
  var rendered=false,attempts=0,timer=null;
  var MAX_ATTEMPTS=40,POLL_MS=250;
  var seen=[];
  function looksLikeHtml(v){
    if(typeof v!=='string')return false;
    var head=v.slice(0,200).toLowerCase();
    return head.indexOf('<!doctype html')!==-1||head.indexOf('<html')!==-1;
  }
  function render(html){
    if(rendered||!looksLikeHtml(html))return false;
    rendered=true;
    if(timer){clearInterval(timer);timer=null;}
    root.innerHTML='';
    var frame=document.createElement('iframe');
    frame.className='sheet';
    frame.setAttribute('sandbox','allow-same-origin');
    frame.setAttribute('referrerpolicy','no-referrer');
    frame.srcdoc=html;
    frame.height='900';
    root.appendChild(frame);
    function fit(){
      try{
        var doc=frame.contentDocument;
        if(!doc||!doc.body)return;
        var h=Math.max(doc.body.scrollHeight,doc.documentElement?doc.documentElement.scrollHeight:0);
        if(h>0)frame.height=String(h);
      }catch(e){}
    }
    frame.addEventListener('load',function(){fit();setTimeout(fit,150);setTimeout(fit,600);});
    return true;
  }
  function collect(){
    var out=[],o=window.openai;
    if(o){
      if(o.toolOutput){
        out.push(o.toolOutput.previewHtml);
        if(o.toolOutput._meta)out.push(o.toolOutput._meta.previewHtml);
      }
      if(o.toolResponseMetadata)out.push(o.toolResponseMetadata.previewHtml);
      if(o.widgetState)out.push(o.widgetState.previewHtml);
    }
    return out;
  }
  function tryGlobals(){
    var c=collect();
    for(var i=0;i<c.length;i++){if(render(c[i]))return true;}
    return false;
  }
  function describe(){
    var lines=[];
    var o=window.openai;
    lines.push('window.openai present: '+(!!o));
    if(o){
      try{lines.push('openai keys: '+Object.keys(o).join(', '));}catch(e){lines.push('openai keys: unreadable');}
      ['toolOutput','toolResponseMetadata','widgetState','toolInput'].forEach(function(k){
        var v=o[k];
        if(v&&typeof v==='object'){
          try{lines.push(k+' keys: '+Object.keys(v).join(', '));}catch(e){lines.push(k+': unreadable');}
        }else{
          lines.push(k+': '+(typeof v));
        }
      });
    }
    lines.push('postMessage methods seen: '+(seen.length?seen.join(', '):'none'));
    return lines.join(String.fromCharCode(10));
  }
  window.addEventListener('openai:set_globals',function(){tryGlobals();});
  window.addEventListener('message',function(event){
    var m=event.data;
    if(!m||typeof m!=='object')return;
    if(m.method&&seen.indexOf(m.method)===-1&&seen.length<12)seen.push(String(m.method));
    if(rendered)return;
    var probes=[
      m.previewHtml,
      m.params&&m.params.previewHtml,
      m.params&&m.params._meta&&m.params._meta.previewHtml,
      m.params&&m.params.toolResponseMetadata&&m.params.toolResponseMetadata.previewHtml,
      m.params&&m.params.structuredContent&&m.params.structuredContent.previewHtml,
      m.params&&m.params.toolOutput&&m.params.toolOutput.previewHtml,
      m.data&&m.data.previewHtml,
      m.result&&m.result._meta&&m.result._meta.previewHtml
    ];
    for(var i=0;i<probes.length;i++){if(render(probes[i]))return;}
  },{passive:true});
  timer=setInterval(function(){
    attempts++;
    if(tryGlobals())return;
    if(attempts>=MAX_ATTEMPTS){
      clearInterval(timer);timer=null;
      if(rendered)return;
      root.innerHTML='';
      var a=document.createElement('div');
      a.className='msg error';
      a.textContent='Preview unavailable. The formatted document was created successfully - use the DOCX or PDF export.';
      var b=document.createElement('div');
      b.className='diag';
      b.textContent=describe();
      root.appendChild(a);root.appendChild(b);
    }
  },POLL_MS);
  tryGlobals();
})();
</script></body></html>`;
//# sourceMappingURL=mcp.js.map