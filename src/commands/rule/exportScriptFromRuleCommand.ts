import * as vscode from 'vscode';
import { RuleTreeItem } from '../../models/ISCTreeItem';
import { ISCClient } from '../../services/ISCClient';
import { toDateSuffix } from '../../utils';
import * as fs from 'fs';
import { confirmFileOverwrite, openPreview } from '../../utils/vsCodeHelpers';
import { getIdByUri, getNameByUri } from '../../utils/UriUtils';
import { TenantService } from '../../services/TenantService';
import { ensureFolderExists } from '../../utils/fileutils';
import { join } from 'path';


export class ExportScriptFromRuleCommand {
    constructor(private readonly tenantService: TenantService) { }
    
    public async exportScriptView(node?: RuleTreeItem): Promise<void> {

        if (node === undefined || !(node instanceof RuleTreeItem)) {
            console.log("WARNING: exportScriptView: invalid item", node);
            throw new Error("exportScriptView: invalid item");
        }

        await this.exportScript(node.tenantId, node.tenantName, node.label as string, node.id as string);
    }

    public async exportScriptEditor(): Promise<void> {

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            console.error('No editor');
            return;
        }

        const tenantName = editor.document.uri.authority;
        const ruleId = getIdByUri(editor.document.uri);
        const ruleName = getNameByUri(editor.document.uri);

        if (!ruleId || !tenantName || !ruleName) {
            console.error("Invalid editor uri:", editor.document.uri);
        }
        const tenantInfo = await this.tenantService.getTenantByTenantName(tenantName);
        await this.exportScript(tenantInfo?.id ?? "", tenantName, ruleName as string, ruleId as string);
    }


    private buildProposedFilePath(tenantName: string, ruleName: string): string {
        let exportFile = '';

        if (vscode.workspace.workspaceFolders !== undefined) {
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath.replace(/\\/g, "/");
            const exportFolder = join(workspaceFolder, 'exportedObjects', 'rule-scripts');
            exportFile = join(exportFolder, 'script-' + tenantName + '-' + ruleName + '-' + toDateSuffix() + '.bsh');
        }

        return exportFile;
    }


    private async chooseFileForExport(proposedFile: string): Promise<string | undefined> {
        console.log("> chooseFileForExport: " + proposedFile);
        let exportFile: string | undefined = undefined;

        exportFile = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            value: proposedFile,
            prompt: 'Enter the file to save the script to'
        });
        if (exportFile) {
            const overwrite = await confirmFileOverwrite(exportFile);
            if (!overwrite) {
                exportFile = undefined;
            }
        }
        console.log("< chooseFileForExport: " + exportFile);
        return exportFile;
    }

    private async exportScript(tenantId:string, tenantName: string, ruleName: string, ruleId: string): Promise<void> {
        console.log(`> exportScript: tenantName=${tenantName}, ruleName=${ruleName}, ruleId=${ruleId}`);
        let exportFile: string | undefined = this.buildProposedFilePath(tenantName, ruleName);
        exportFile = await this.chooseFileForExport(exportFile);
        if (!exportFile) {
            return;
        }

        ensureFolderExists(exportFile);

        const client = new ISCClient(tenantId, tenantName);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Exporting script from rule ${ruleName}...`,
            cancellable: true
        }, async (task, token) => {

            const rule = await client.getConnectorRuleById(ruleId);
            if (!rule) {
                console.error(`Rule not found:  tenantName=${tenantName}, ruleId=${ruleId}`);
                throw new Error(`Rule not found:  tenantName=${tenantName}, ruleId=${ruleId}`);
            }
            if (token.isCancellationRequested) {
                return;
            }

            fs.writeFileSync(exportFile as string, rule.sourceCode?.script ?? '', { encoding: "utf8" });
            openPreview(exportFile, 'java')
            vscode.window.showInformationMessage(`Successfully exported script from rule ${ruleName}`);
        });
    }
}