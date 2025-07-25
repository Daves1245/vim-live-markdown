import Fastify from 'fastify';
import { readFile, access, writeFile } from 'fs/promises';
import { constants } from 'fs';
import chokidar from 'chokidar';
import { Server } from 'socket.io';
import MarkdownIt from 'markdown-it';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { exec } from 'child_process';

const filepath = process.argv[2];

if (!filepath) {
    console.error('Usage: node server.js <markdown-file-path>');
    process.exit(1);
}

const fastify = Fastify({
    logger: false
});

const io = new Server(fastify.server);
const md = new MarkdownIt();

// the browser needs the socket.io.js file
fastify.register(fastifyStatic, {
    root: join(dirname(require.resolve('socket.io-client/dist/socket.io.js'))),
    prefix: '/socket.io/',
});

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function readMarkdownFile(path: string): Promise<string | null> {
    try {
        return await readFile(path, 'utf8');
    } catch (error) {
        console.error(`error reading ${path}:`, error);
        return null;
    }
}

fastify.get('/', async (request, reply) => {
    reply.type('text/html');
    return `<!DOCTYPE html>
    <html>
    <head>
        <title>Live Markdown Preview</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            #content { line-height: 1.6; }
        </style>
    </head>
    <body>
        <div id="content">Loading...</div>
        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io()
            socket.on('content', html => document.getElementById('content').innerHTML = html)
            socket.on('error', error => {
                document.getElementById('content').innerHTML = '<p style="color: red;">Error: ' + error + '</p>'
            })
        </script>
    </body>
    </html>
    `
});

// watch file
chokidar.watch(filepath).on('change', async () => {
    const content = await readMarkdownFile(filepath);
    if (content !== null) {
        io.emit('content', md.render(content));
    } else {
        io.emit('error', 'failed to read file');
    }
});

io.on('connection', async (socket) => {
    if (!(await fileExists(filepath))) {
        socket.emit('error', `file not found: ${filepath}`);
        return;
    }

    const content = await readMarkdownFile(filepath);
    if (content !== null) {
        socket.emit('content', md.render(content));
    } else {
        socket.emit('error', 'failed to read file');
    }
});

const stop = async () => {
    try {
        await fastify.close();
        console.log('server stopped');
    } catch (error) {
        // ignore cleanup errors
    }
    process.exit(0);
};

const start = async () => {
    try {
        if (!(await fileExists(filepath))) {
            console.error(`error: file not found: ${filepath}`);
            process.exit(1);
        }

        await fastify.listen({ port: 58293, host: '127.0.0.1' });
        const url = 'http://127.0.0.1:58293';
        
        console.log(`server started on ${url}`);
        console.log(`watching file: ${filepath}`);

        // open browser window
        exec(`xdg-open "${url}"`, (error) => {
            if (error) {
                console.log('could not open browser automatically. please visit:', url);
            }
        });
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
            console.error('port 58293 is already in use. kill existing server with: pkill -f "node.*server.js"');
        } else {
            console.error('error starting server:', error);
        }
        process.exit(1);
    }
}

// Cleanup on exit signals
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

start();
