use deno_core::OpDecl;

/// No Rust ops — ReadableStream, WritableStream, TransformStream,
/// Blob, File, FormData are all pure JS.
pub fn op_decls() -> Vec<OpDecl> {
    vec![]
}

/// Bootstrap JS for Streams, Blob, File, FormData.
pub const STREAMS_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  // =====================================================================
  // ReadableStreamDefaultReader
  // =====================================================================
  class ReadableStreamDefaultReader {
    #stream;
    #closed = false;
    #closedPromise;
    #resolveClose;

    constructor(stream) {
      if (stream._locked) throw new TypeError('ReadableStream is already locked');
      this.#stream = stream;
      stream._locked = true;
      this.#closedPromise = new Promise(resolve => { this.#resolveClose = resolve; });
    }

    async read() {
      if (this.#closed) return { done: true, value: undefined };
      const chunk = await this.#stream._pull();
      if (chunk === null) {
        this.#closed = true;
        this.#resolveClose();
        return { done: true, value: undefined };
      }
      return { done: false, value: chunk };
    }

    releaseLock() {
      if (this.#stream) this.#stream._locked = false;
      this.#stream = null;
    }

    get closed() { return this.#closedPromise; }

    async cancel(reason) {
      this.#closed = true;
      this.#resolveClose();
      if (this.#stream && this.#stream._cancel) {
        await this.#stream._cancel(reason);
      }
      this.releaseLock();
    }
  }

  // =====================================================================
  // ReadableStream
  // =====================================================================
  class ReadableStream {
    _locked = false;
    #queue = [];
    #closed = false;
    #pullResolvers = []; // Array of {resolve, reject}
    #cancelFn = null;
    #pullFn = null;
    #started = false;

    constructor(underlyingSource = {}) {
      const controller = {
        enqueue: (chunk) => {
          if (this.#closed) return;
          if (this.#pullResolvers.length > 0) {
            const { resolve } = this.#pullResolvers.shift();
            resolve(chunk);
          } else {
            this.#queue.push(chunk);
          }
        },
        close: () => {
          this.#closed = true;
          // Resolve any pending pulls with null (EOF)
          for (const { resolve } of this.#pullResolvers) {
            resolve(null);
          }
          this.#pullResolvers = [];
        },
        error: (e) => {
          this.#closed = true;
          // Reject pending pulls with the error
          for (const { reject } of this.#pullResolvers) {
            reject(e);
          }
          this.#pullResolvers = [];
        },
        get desiredSize() { return 1; },
      };

      this.#cancelFn = underlyingSource.cancel || null;
      this.#pullFn = underlyingSource.pull || null;

      if (underlyingSource.start) {
        const result = underlyingSource.start(controller);
        if (result && typeof result.then === 'function') {
          result.then(() => { this.#started = true; });
        } else {
          this.#started = true;
        }
      } else {
        this.#started = true;
      }

      // Store controller for pull
      this._controller = controller;
    }

    get locked() { return this._locked; }

    async _pull() {
      if (this.#queue.length > 0) {
        return this.#queue.shift();
      }
      if (this.#closed) return null;
      if (this.#pullFn) {
        await this.#pullFn(this._controller);
        if (this.#queue.length > 0) return this.#queue.shift();
        if (this.#closed) return null;
      }
      // Wait for next enqueue, close, or error
      return new Promise((resolve, reject) => {
        this.#pullResolvers.push({ resolve, reject });
      });
    }

    async _cancel(reason) {
      if (this.#cancelFn) await this.#cancelFn(reason);
      this.#closed = true;
    }

    getReader() {
      return new ReadableStreamDefaultReader(this);
    }

    pipeThrough(transform) {
      const reader = this.getReader();
      const writer = transform.writable.getWriter();
      (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            await writer.close();
            break;
          }
          await writer.write(value);
        }
      })().catch(() => {});
      return transform.readable;
    }

    async pipeTo(dest) {
      const reader = this.getReader();
      const writer = dest.getWriter();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          await writer.close();
          break;
        }
        await writer.write(value);
      }
    }

    [Symbol.asyncIterator]() {
      const reader = this.getReader();
      return {
        async next() {
          const result = await reader.read();
          if (result.done) {
            reader.releaseLock();
            return { done: true, value: undefined };
          }
          return result;
        },
        async return() {
          reader.releaseLock();
          return { done: true, value: undefined };
        },
      };
    }

    tee() {
      const reader = this.getReader();
      let buf1 = [], buf2 = [];
      let resolve1 = [], resolve2 = [];
      let closed = false;

      async function pullOriginal() {
        if (closed) return;
        const { done, value } = await reader.read();
        if (done) {
          closed = true;
          for (const r of resolve1) r(null);
          for (const r of resolve2) r(null);
          resolve1 = []; resolve2 = [];
          return;
        }
        if (resolve1.length > 0) resolve1.shift()(value);
        else buf1.push(value);
        if (resolve2.length > 0) resolve2.shift()(value);
        else buf2.push(value);
      }

      function makeStream(buf, resolvers) {
        return new ReadableStream({
          pull(controller) {
            if (buf.length > 0) {
              controller.enqueue(buf.shift());
              return;
            }
            if (closed) { controller.close(); return; }
            return new Promise(resolve => {
              resolvers.push((val) => {
                if (val === null) controller.close();
                else controller.enqueue(val);
                resolve();
              });
              pullOriginal();
            });
          }
        });
      }

      return [makeStream(buf1, resolve1), makeStream(buf2, resolve2)];
    }
  }

  // =====================================================================
  // WritableStreamDefaultWriter
  // =====================================================================
  class WritableStreamDefaultWriter {
    #stream;
    #closed = false;

    constructor(stream) {
      if (stream._locked) throw new TypeError('WritableStream is already locked');
      this.#stream = stream;
      stream._locked = true;
    }

    async write(chunk) {
      if (this.#closed) throw new TypeError('Writer is closed');
      await this.#stream._write(chunk);
    }

    async close() {
      this.#closed = true;
      await this.#stream._close();
      this.releaseLock();
    }

    async abort(reason) {
      this.#closed = true;
      await this.#stream._abort(reason);
      this.releaseLock();
    }

    releaseLock() {
      if (this.#stream) this.#stream._locked = false;
      this.#stream = null;
    }

    get closed() { return this.#closed; }
  }

  // =====================================================================
  // WritableStream
  // =====================================================================
  class WritableStream {
    _locked = false;
    #writeFn;
    #closeFn;
    #abortFn;

    constructor(underlyingSink = {}) {
      this.#writeFn = underlyingSink.write || (() => {});
      this.#closeFn = underlyingSink.close || (() => {});
      this.#abortFn = underlyingSink.abort || (() => {});
    }

    get locked() { return this._locked; }

    getWriter() {
      return new WritableStreamDefaultWriter(this);
    }

    async _write(chunk) {
      await this.#writeFn(chunk);
    }

    async _close() {
      await this.#closeFn();
    }

    async _abort(reason) {
      await this.#abortFn(reason);
    }
  }

  // =====================================================================
  // TransformStream
  // =====================================================================
  class TransformStream {
    #readable;
    #writable;

    constructor(transformer = {}) {
      let readableController;

      this.#readable = new ReadableStream({
        start(controller) {
          readableController = controller;
        },
      });

      const transformFn = transformer.transform || ((chunk, controller) => {
        controller.enqueue(chunk);
      });
      const flushFn = transformer.flush || (() => {});

      const transformController = {
        enqueue(chunk) { readableController.enqueue(chunk); },
        error(e) { readableController.error(e); },
        terminate() { readableController.close(); },
      };

      this.#writable = new WritableStream({
        write(chunk) {
          return transformFn(chunk, transformController);
        },
        close() {
          flushFn(transformController);
          readableController.close();
        },
      });
    }

    get readable() { return this.#readable; }
    get writable() { return this.#writable; }
  }

  // =====================================================================
  // Blob
  // =====================================================================
  class Blob {
    #parts;
    #type;

    constructor(parts = [], options = {}) {
      this.#type = options.type || '';
      // Flatten parts into a single byte buffer
      const buffers = [];
      for (const part of parts) {
        if (typeof part === 'string') {
          buffers.push(new TextEncoder().encode(part));
        } else if (part instanceof Blob) {
          buffers.push(part._bytes());
        } else if (part instanceof ArrayBuffer) {
          buffers.push(new Uint8Array(part));
        } else if (ArrayBuffer.isView(part)) {
          buffers.push(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
        }
      }
      // Concatenate
      let totalLen = 0;
      for (const b of buffers) totalLen += b.byteLength;
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const b of buffers) {
        merged.set(b, offset);
        offset += b.byteLength;
      }
      this.#parts = merged;
    }

    get size() { return this.#parts.byteLength; }
    get type() { return this.#type; }

    async text() {
      return new TextDecoder().decode(this.#parts);
    }

    async arrayBuffer() {
      return this.#parts.buffer.slice(
        this.#parts.byteOffset,
        this.#parts.byteOffset + this.#parts.byteLength
      );
    }

    slice(start = 0, end = this.#parts.byteLength, contentType = '') {
      const s = start < 0 ? Math.max(this.#parts.byteLength + start, 0) : Math.min(start, this.#parts.byteLength);
      const e = end < 0 ? Math.max(this.#parts.byteLength + end, 0) : Math.min(end, this.#parts.byteLength);
      const sliced = this.#parts.slice(s, e);
      const blob = new Blob([], { type: contentType });
      blob.#parts = sliced;
      return blob;
    }

    async bytes() {
      return new Uint8Array(this.#parts);
    }

    // Internal: get raw bytes
    _bytes() {
      return this.#parts;
    }

    stream() {
      const bytes = this.#parts;
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(bytes));
          controller.close();
        },
      });
    }
  }

  // =====================================================================
  // File (extends Blob)
  // =====================================================================
  class File extends Blob {
    #name;
    #lastModified;

    constructor(parts, name, options = {}) {
      super(parts, options);
      this.#name = String(name);
      this.#lastModified = options.lastModified !== undefined ? options.lastModified : Date.now();
    }

    get name() { return this.#name; }
    get lastModified() { return this.#lastModified; }
  }

  // =====================================================================
  // FormData
  // =====================================================================
  class FormData {
    #entries = [];

    append(name, value, filename) {
      if (value instanceof Blob && filename !== undefined) {
        value = new File([value._bytes()], filename, { type: value.type });
      }
      this.#entries.push([String(name), value]);
    }

    delete(name) {
      const key = String(name);
      this.#entries = this.#entries.filter(([k]) => k !== key);
    }

    get(name) {
      const key = String(name);
      const entry = this.#entries.find(([k]) => k === key);
      return entry ? entry[1] : null;
    }

    getAll(name) {
      const key = String(name);
      return this.#entries.filter(([k]) => k === key).map(([, v]) => v);
    }

    has(name) {
      return this.#entries.some(([k]) => k === String(name));
    }

    set(name, value, filename) {
      const key = String(name);
      this.delete(key);
      this.append(key, value, filename);
    }

    *entries() {
      for (const entry of this.#entries) {
        yield entry;
      }
    }

    *keys() {
      for (const [k] of this.#entries) {
        yield k;
      }
    }

    *values() {
      for (const [, v] of this.#entries) {
        yield v;
      }
    }

    forEach(callback, thisArg) {
      for (const [k, v] of this.#entries) {
        callback.call(thisArg, v, k, this);
      }
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }

  // =====================================================================
  // Expose globals
  // =====================================================================
  globalThis.ReadableStream = ReadableStream;
  globalThis.WritableStream = WritableStream;
  globalThis.TransformStream = TransformStream;
  globalThis.Blob = Blob;
  globalThis.File = File;
  globalThis.FormData = FormData;
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    async fn run_async(rt: &mut VertzJsRuntime, code: &str) -> serde_json::Value {
        let wrapped = format!(
            r#"(async () => {{ {} }})().then(v => {{ globalThis.__result = v; }}).catch(e => {{ globalThis.__result = 'ERROR: ' + e.message; }})"#,
            code
        );
        rt.execute_script_void("<test>", &wrapped).unwrap();
        rt.run_event_loop().await.unwrap();
        rt.execute_script("<read>", "globalThis.__result").unwrap()
    }

    // --- ReadableStream ---

    #[tokio::test]
    async fn test_readable_stream_get_reader() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue('a');
                    controller.enqueue('b');
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const r1 = await reader.read();
            const r2 = await reader.read();
            const r3 = await reader.read();
            return [r1.value, r2.value, r3.done];
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!(["a", "b", true]));
    }

    #[tokio::test]
    async fn test_readable_stream_async_iterator() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(1);
                    controller.enqueue(2);
                    controller.enqueue(3);
                    controller.close();
                },
            });
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            return chunks;
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!([1, 2, 3]));
    }

    #[tokio::test]
    async fn test_readable_stream_locked() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const stream = new ReadableStream({
                start(c) { c.close(); },
            });
            const before = stream.locked;
            stream.getReader();
            return [before, stream.locked];
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!([false, true]));
    }

    // --- TransformStream + pipeThrough ---

    #[tokio::test]
    async fn test_transform_stream_pipe_through() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const source = new ReadableStream({
                start(controller) {
                    controller.enqueue('hello');
                    controller.enqueue('world');
                    controller.close();
                },
            });
            const transform = new TransformStream({
                transform(chunk, controller) {
                    controller.enqueue(chunk.toUpperCase());
                },
            });
            const result = source.pipeThrough(transform);
            const chunks = [];
            for await (const chunk of result) {
                chunks.push(chunk);
            }
            return chunks;
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!(["HELLO", "WORLD"]));
    }

    // --- WritableStream ---

    #[tokio::test]
    async fn test_writable_stream() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const chunks = [];
            const ws = new WritableStream({
                write(chunk) { chunks.push(chunk); },
            });
            const writer = ws.getWriter();
            await writer.write('a');
            await writer.write('b');
            await writer.close();
            return chunks;
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!(["a", "b"]));
    }

    // --- Blob ---

    #[tokio::test]
    async fn test_blob_text() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const blob = new Blob(['hello ', 'world'], { type: 'text/plain' });
            const text = await blob.text();
            return [text, blob.size, blob.type];
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!(["hello world", 11, "text/plain"]));
    }

    #[tokio::test]
    async fn test_blob_slice() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const blob = new Blob(['hello world']);
            const slice = blob.slice(0, 5);
            return [await slice.text(), slice.size];
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!(["hello", 5]));
    }

    #[tokio::test]
    async fn test_blob_array_buffer() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const blob = new Blob(['hi']);
            const ab = await blob.arrayBuffer();
            return [ab.byteLength, new Uint8Array(ab)[0], new Uint8Array(ab)[1]];
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!([2, 104, 105])); // 'h'=104, 'i'=105
    }

    // --- File ---

    #[test]
    fn test_file_properties() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const f = new File(['content'], 'doc.txt', { type: 'text/plain', lastModified: 12345 });
                [f.name, f.type, f.size, f.lastModified]
            "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!(["doc.txt", "text/plain", 7, 12345])
        );
    }

    // --- FormData ---

    #[test]
    fn test_formdata_append_get() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const fd = new FormData();
                fd.append('name', 'vertz');
                fd.append('version', '1.0');
                [fd.get('name'), fd.get('version'), fd.get('missing')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["vertz", "1.0", null]));
    }

    #[test]
    fn test_formdata_get_all() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const fd = new FormData();
                fd.append('tag', 'a');
                fd.append('tag', 'b');
                fd.getAll('tag')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["a", "b"]));
    }

    #[test]
    fn test_formdata_has_delete() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const fd = new FormData();
                fd.append('key', 'val');
                const before = fd.has('key');
                fd.delete('key');
                [before, fd.has('key')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([true, false]));
    }

    #[test]
    fn test_formdata_set() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const fd = new FormData();
                fd.append('key', 'a');
                fd.append('key', 'b');
                fd.set('key', 'c');
                [fd.get('key'), fd.getAll('key').length]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["c", 1]));
    }

    #[test]
    fn test_formdata_entries_iteration() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const fd = new FormData();
                fd.append('a', '1');
                fd.append('b', '2');
                const entries = [];
                for (const [k, v] of fd) {
                    entries.push(k + '=' + v);
                }
                entries
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["a=1", "b=2"]));
    }

    #[test]
    fn test_formdata_foreach() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const fd = new FormData();
                fd.append('x', 'y');
                const out = [];
                fd.forEach((v, k) => out.push(k + ':' + v));
                out
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["x:y"]));
    }
}
