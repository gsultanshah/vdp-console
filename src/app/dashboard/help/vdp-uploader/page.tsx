'use client';

import { CodeBlock, HelpPageHeader, Section } from '@/components/help/HelpDoc';

export default function VdpUploaderHelpPage() {
  return (
    <div className="space-y-8">
      <HelpPageHeader
        title="VDP Image Uploader"
        description="Upload voter list images to Firebase Storage and store metadata in MongoDB."
      />

      <Section title="Usage">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="py-2 pr-4 text-left font-semibold text-gray-900">Command</th>
                <th className="py-2 text-left font-semibold text-gray-900">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['npm start', 'Start the interactive upload flow'],
                ['node index.js', 'Same as npm start'],
                ['npm run reset', 'Reset file/folder status suffixes'],
                ['node index.js reset', 'Same as npm run reset'],
                ['node index.js delete', 'Delete a Halka and its MongoDB records'],
                ['node index.js -h', 'Show help'],
                ['node index.js --help', 'Show help'],
              ].map(([cmd, desc]) => (
                <tr key={cmd}>
                  <td className="py-2 pr-4 font-mono text-indigo-700 whitespace-nowrap">{cmd}</td>
                  <td className="py-2 text-gray-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Using on Windows">
        <p>
          The uploader is a Node.js CLI tool. On Windows, use <strong>PowerShell</strong> or{' '}
          <strong>Command Prompt</strong> (cmd).
        </p>

        <p className="font-medium text-gray-900">1. Install Node.js</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Download and install the LTS version from <a href="https://nodejs.org" className="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">nodejs.org</a></li>
          <li>Close and reopen your terminal after installation</li>
          <li>Verify: <code className="rounded bg-gray-100 px-1">node -v</code> and <code className="rounded bg-gray-100 px-1">npm -v</code></li>
        </ul>

        <p className="font-medium text-gray-900">2. Open the project folder</p>
        <CodeBlock>{`cd C:\\path\\to\\vdp-uploader
npm install`}</CodeBlock>
        <p>
          Replace the path with wherever you cloned or extracted the uploader. In File Explorer,
          you can copy a folder path from the address bar and paste it after{' '}
          <code className="rounded bg-gray-100 px-1">cd</code>.
        </p>

        <p className="font-medium text-gray-900">3. Configure .env</p>
        <p>
          Create a file named <code className="rounded bg-gray-100 px-1">.env</code> in the project
          root (same folder as <code className="rounded bg-gray-100 px-1">package.json</code>).
          Use Notepad or VS Code — save as &quot;All files&quot; so it is not named{' '}
          <code className="rounded bg-gray-100 px-1">.env.txt</code>.
        </p>
        <p>
          For <code className="rounded bg-gray-100 px-1">FIREBASE_PRIVATE_KEY</code> on Windows,
          keep the key on one line with <code className="rounded bg-gray-100 px-1">\n</code> for line
          breaks inside double quotes:
        </p>
        <CodeBlock>{`FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"`}</CodeBlock>

        <p className="font-medium text-gray-900">4. Start the upload flow</p>
        <CodeBlock>{`npm start`}</CodeBlock>
        <p>Equivalent commands in PowerShell or cmd:</p>
        <CodeBlock>{`node index.js
npm run reset
node index.js reset
node index.js delete`}</CodeBlock>

        <p className="font-medium text-gray-900">5. Enter the constituency folder path</p>
        <p>
          When prompted, paste the full Windows path to your prepared constituency directory.
          Use backslashes or forward slashes — both work in Node.js:
        </p>
        <CodeBlock>{`C:\\VoterData\\NA-120
D:/Scans/PP23
"C:\\My Documents\\Voter Lists\\NA-120"`}</CodeBlock>
        <p>
          If the path contains spaces, wrap it in double quotes. The folder must follow the
          blockcode structure described below (e.g.{' '}
          <code className="rounded bg-gray-100 px-1">C:\VoterData\NA-120\BC001\muslim\male\page-first.jpg</code>
          ).
        </p>

        <p className="font-medium text-gray-900">6. After the run</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><code className="rounded bg-gray-100 px-1">upload.log</code> and <code className="rounded bg-gray-100 px-1">error.log</code> appear in the constituency folder</li>
          <li><code className="rounded bg-gray-100 px-1">upload-report.html</code> — open in Chrome or Edge to review the summary</li>
          <li>Uploaded files are renamed with <code className="rounded bg-gray-100 px-1">-uploaded-{'{mongoId}'}</code> suffixes locally</li>
          <li>Run <code className="rounded bg-gray-100 px-1">npm run reset</code> before a re-upload to clear status suffixes</li>
        </ul>

        <p className="font-medium text-gray-900">Tips</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Run the terminal as a normal user; avoid paths that require Administrator unless needed</li>
          <li>Keep the terminal window open until the upload finishes — closing it stops the process</li>
          <li>If <code className="rounded bg-gray-100 px-1">npm</code> is not recognized, reinstall Node.js and ensure &quot;Add to PATH&quot; was checked during setup</li>
          <li>Long path names: enable long paths in Windows or keep folder names short</li>
        </ul>
      </Section>

      <Section title="Valid local folder structure">
        <p>
          Point the uploader at a directory containing blockcode subfolders. Each blockcode folder
          name is used as the <code className="rounded bg-gray-100 px-1">blockCode</code> in Firebase
          and MongoDB.
        </p>
        <CodeBlock>{`constituency-path/              ← directory you enter at startup
├── blockcode1/               ← e.g. BC001, PS-42 (folder name = blockCode)
│   ├── title.jpg             ← title page (file directly in blockcode folder)
│   ├── muslim/
│   │   ├── male/
│   │   │   ├── page-first.jpg   ← tag: first (filename contains "first")
│   │   │   ├── page-regular.jpg ← tag: regular
│   │   │   └── page-last.jpg    ← tag: last (filename contains "last")
│   │   └── female/
│   │       └── page-first.jpg
│   └── qadiani/
│       └── male/
│           └── page-first.jpg
├── blockcode2/
│   └── ...
├── upload.log               ← created after successful uploads
├── error.log                ← created on errors
└── upload-report.html       ← summary report after run`}</CodeBlock>
      </Section>

      <Section title="Firebase Storage path">
        <CodeBlock>{`{halkaName}/{blockCode}/{originalFileName}
Example: NA-120/BC001/page-first.jpg`}</CodeBlock>
      </Section>

      <Section title="Path rules">
        <ul className="list-disc space-y-2 pl-5">
          <li>Supported images: <code className="rounded bg-gray-100 px-1">.jpg</code>, <code className="rounded bg-gray-100 px-1">.jpeg</code>, <code className="rounded bg-gray-100 px-1">.png</code></li>
          <li><code className="rounded bg-gray-100 px-1">religion/gender/file</code> → religion and gender from folder names</li>
          <li><code className="rounded bg-gray-100 px-1">religion/file</code> → religion from folder, gender defaults to male</li>
          <li>File in blockcode root → tag is <code className="rounded bg-gray-100 px-1">title</code></li>
        </ul>
      </Section>

      <Section title="Status suffixes (local files)">
        <ul className="list-disc space-y-2 pl-5">
          <li><code className="rounded bg-gray-100 px-1">-uploading</code> — file is being uploaded</li>
          <li><code className="rounded bg-gray-100 px-1">-uploaded-{'{mongoId}'}</code> — upload completed</li>
          <li><code className="rounded bg-gray-100 px-1">-COMPLETED</code> — blockcode folder finished (use <code className="rounded bg-gray-100 px-1">npm run reset</code> to clear)</li>
        </ul>
      </Section>

      <Section title="Environment">
        <p>Configure <code className="rounded bg-gray-100 px-1">.env</code> with:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_MONGODB_URI</code></li>
          <li><code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_FIREBASE_*</code></li>
          <li><code className="rounded bg-gray-100 px-1">FIREBASE_CLIENT_EMAIL</code></li>
          <li><code className="rounded bg-gray-100 px-1">FIREBASE_PRIVATE_KEY</code></li>
        </ul>
        <p className="mt-2 text-gray-500">See README.md in the vdp-uploader project for full setup details.</p>
      </Section>
    </div>
  );
}
