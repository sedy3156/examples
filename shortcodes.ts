/**
 *
 * Readme building script
 *
 * Reads special comments in `test-code/*.use.ts` files and extract code blocks
 * ```
 * //<gen>block_name
 * Code here
 * //</gen>
 * ```
 * Creates a shortcode in themes/ms/layouts/shortcodes that can be used in content
 */
import debug from "debug";
import * as fs from "fs";
import {join} from "path";
import glob from "fast-glob";
import util from 'util';
import { exec} from 'child_process';
const execAsync = util.promisify(exec);
const log = debug("scripts/shortcodes");

function minIndent(inp: string) {
    const match = inp.match(/^[ \t]*(?=\S)/gm);

    if (!match) {
        return 0;
    }

    return match.reduce((r, a) => Math.min(r, a.length), Infinity);
}

function stripIndent(inp: string) {
    const indent = minIndent(inp);

    if (indent === 0) {
        return inp;
    }

    const regex = new RegExp(`^[ \\t]{${indent}}`, "gm");

    return inp.replace(regex, "");
}

async function getFileContent(path: string): Promise<string> {
    const content = await fs.promises.readFile(path, {encoding: "utf-8"});
    return content.toString();
}

async function checkFile(content: string, commentStart:string, commentEnd: string) {
    const startCount = (content.match(new RegExp(commentStart, "gm")) || []).length;
    const endCount = (content.match(new RegExp(commentEnd, "gm")) || []).length;
    if (startCount !== endCount) {
        throw Error(
            `Expected matching start and end comments ${startCount} ${endCount}`
        );
    }
}

type Block = { id: string; body: string };

async function getGenBlocks(content: string, commentStart:string, commentEnd:string): Promise<Block[]> {
    const pKeys = new RegExp(`${commentStart}([0-9a-zA-Z_]*)`, "g");
    const matchKeys = [...content.matchAll(pKeys)];
    const matches: Block[][] = matchKeys.map(([_, key]) => {
        const pBlock = new RegExp(
            `${commentStart}${key}[\\r\\n]*([\\s\\S]+)${commentEnd}`,
            "g"
        );
        log(`Key ${key} match ${pBlock}`);
        const blocks = [...content.matchAll(pBlock)];
        log(`Found ${blocks.length} block for ${key}`);
        return blocks.map((it) => {
            log(`Inside ${key} block with ${it.length} params`);
            const [_, body] = it;
            return {id: key, body: stripIndent(body.split(commentEnd)[0])};
        });
    });
    return ([] as Block[]).concat(...matches);
}

async function files(...p: string[]) {
    return glob(p.map(pp => join(__dirname, pp)))
}

const treeCommand = (path:string) => `tree --gitignore --charset utf-8 --prune ${path} | sed '1d' | sed '$d'`;
async function getFileTree(path:string): Promise<string> {
    const {stdout,stderr} = await execAsync(treeCommand(path))
    if (stderr) {
        throw stderr;
    }
    return stdout
}
(async () => {
    await fs.promises.mkdir(join(__dirname, "/shortcodes"), {
        recursive: true,
    });
    const fileTrees: {
        id: string,
        path: string
    }[] = [
        { id: 'java_jakarta_mail_tree', path:join(__dirname, '/java-jakarta-mail') }
    ];
    /**
     * Full files to be included in the shortcodes export
     */
    const fullFiles :{ id: string; path: string, highlight: string }[] = [
        { id: 'cypress_plugin_package_json', path: join(__dirname, '/javascript-cypress-mailslurp-plugin/package.json'), highlight: 'json'},
        {id: 'cypress_client_full', path: join(__dirname, '/javascript-cypress-js/cypress/e2e/example.cy.js'), highlight: 'javascript'},
        {id: 'cypress_sms_config', path: join(__dirname, '/javascript-cypress-sms-testing/cypress.config.ts'), highlight: 'typescript'},
        {id: 'cypress_sms_full', path: join(__dirname, '/javascript-cypress-sms-testing/cypress/e2e/integration-test.cy.ts'), highlight: 'typescript'},
        {id: 'cypress_client_package_json', path: join(__dirname, '/javascript-cypress-js/package.json'), highlight: 'json'},
        {id: 'cypress_client_config', path: join(__dirname, '/javascript-cypress-js/cypress.config.js'), highlight: 'javascript'},
        {id: 'cypress_plugin_config', path: join(__dirname, '/javascript-cypress-mailslurp-plugin/cypress.config.ts'), highlight: 'typescript'},
        {id: 'cypress_plugin_full', path: join(__dirname, '/javascript-cypress-mailslurp-plugin/cypress/e2e/integration-test.cy.ts'), highlight: 'typescript'},
        {id: 'java_jakarta_mail_pom', path: join(__dirname, '/java-jakarta-mail/pom.xml'), highlight: 'xml'},
        {id: 'powershell_ps1', path: join(__dirname, '/powershell-email-send-ps1/send.ps1'), highlight: 'pwsh'}
    ]
    // *.use.ts test classes have a special comment -> //<gen>inbox_send ----> //</gen>
    const useCases: { paths: string[], commentStart: string, commentEnd: string, highlight: string }[] = [
        // add
        {
            paths:  await files(
                "/javascript-cypress-sms-testing/**/*.ts",
                "/javascript-cypress-sms-testing/cypress/support/*.js",
                "/nodejs-nodemailer-smtp-example/spec/*Spec.js"
            ),
            commentStart: "//<gen>",
            commentEnd: "//</gen>",
            highlight: "typescript",
        },
        {
            paths:  await files(
                "/javascript-cypress-js/**/*.js",
            "/javascript-cypress-mailslurp-plugin/cypress/support/e2e.js"
            ),
            commentStart: "//<gen>",
            commentEnd: "//</gen>",
            highlight: "javascript",
        },
        {
            paths:  await files("/rlang-email-sending-in-r/*.r"),
            commentStart: "#<gen>",
            commentEnd: "#</gen>",
            highlight: "r",
        },
        { paths:  await files(
                "/java-maven-selenium/src/**/*.java",
            ),
            commentStart: "//<gen>",
            commentEnd: "//</gen>",
            highlight: "java",
        },
        {
            paths:  await files("/playwright-sms-testing/tests/*.spec.ts",
                "/javascript-cypress-mailslurp-plugin/cypress/e2e/*.ts",
                "/playwright-email-testing/tests/*.ts",
                ),
            commentStart: "//<gen>",
            commentEnd: "//</gen>",
            highlight: "typescript",
        },
        {
            paths:  await files("/visualbasic/visualbasic/*.vb"),
            commentStart: "'<gen>",
            commentEnd: "'</gen>",
            highlight: "vba",
        },
        {
            paths:  await files("/golang-smtp-client-test/*.go"),
            commentStart: "<gen>",
            commentEnd: "</gen>",
            highlight: "go",
        },
    ];
    const blockMap: {[key:string]: { body: string; highlight: string} } = {};
    for (const useCase of useCases) {
        for (const filePath of useCase.paths) {
            log(`Get content for ${useCase.highlight}`);
            const content = await getFileContent(filePath);
            log(`Check file ${filePath}`);
            await checkFile(content, useCase.commentStart, useCase.commentEnd);
            log(`Generate blocks ${filePath}`);
            const blocks = await getGenBlocks(content, useCase.commentStart, useCase.commentEnd);
            log(`${blocks.length} blocks found`);
            for (const block of blocks) {
                log(`Writing block ${block.id}`);
                blockMap[useCase.highlight + "_" + block.id] = {body: block.body, highlight: useCase.highlight};
            }
        }
    }

    for(const fullFile of fullFiles) {
        log('Full file ' + fullFile.id)
        const body = await getFileContent(fullFile.path)
        blockMap[fullFile.highlight + "_" + fullFile.id] = { body , highlight: fullFile.highlight }
    }
    for (const fileTree of fileTrees) {
        log('Run tree ' + fileTree.id)
        const body = await getFileTree(fileTree.path)
        blockMap["tree_" + fileTree.id] = { body , highlight: 'text' }
    }

    for (const [key, value] of Object.entries(blockMap)) {
        const f = join(__dirname, "shortcodes", `gen_${key}.html`);
        log(`Replace key in template ${f}`);
        await fs.promises.writeFile(
            f,
            "```" + value.highlight + "\n" +
            (value.body as string).replace(/\n+$/, "")+
            "\n```"
        );
    }
})().catch((err) => {
    log(`ERROR: ${err}`, err);
    process.exit(1);
});

export {};
