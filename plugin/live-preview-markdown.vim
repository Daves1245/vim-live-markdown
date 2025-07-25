command! LiveMarkdown call LivePreviewMarkdown()

function! LivePreviewMarkdown()
	if &filetype != 'markdown'
		echo "Not a markdown file"
		return
	endif

	let filepath = expand('%:p')
	let script_file = expand('<sfile>:p')
	let script_dir = fnamemodify(resolve(script_file), ':h')
	let server_path = resolve(script_dir . '/dist/server.js')

	if !filereadable(server_path)
		echomsg "server not found at: " . server_path
		return
	endif

	let pid_file = "/tmp/live-preview-" . getpid() . ".pid"
	let cmd = "sh -c 'node " . shellescape(server_path) . " " . shellescape(filepath) . " & echo $! > " . shellescape(pid_file) . "'"
	echomsg "command: " . cmd
	let result = system(cmd)
	if v:shell_error != 0
		echomsg "command failed with exit code: " . v:shell_error
		echomsg "output: " . result
		return
	endif
	sleep 500m
	if !filereadable(pid_file)
		echomsg "log file not created: " . pid_file
		return
	endif
	let b:live_preview_pid_file = pid_file
	echomsg "log file: " . pid_file
	" open browser window
	call system("xdg-open http://127.0.0.1:58293")
endfunction

function! StopLivePreview()
	if exists('b:live_preview_pid_file') && filereadable(b:live_preview_pid_file)
		let pid = readfile(b:live_preview_pid_file)[0]
		if pid != ""
			call system('kill ' . pid)
			call delete(b:live_preview_pid_file)
		endif
		unlet b:live_preview_pid_file
	endif
endfunction

" auto-map localleader for markdown files
augroup LiveMarkdown
	autocmd!
	if !exists('maplocalleader')
		autocmd FileType markdown let maplocalleader = ","
	endif
	autocmd FileType markdown nnoremap <buffer> <LocalLeader>p :call LivePreviewMarkdown()<CR>
	autocmd BufDelete,BufWipeout *.md call StopLivePreview()
augroup END
