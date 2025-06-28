const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');

// Function to run a command and pipe output
const runCommand = (command, args) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}`));
        return;
      }
      resolve();
    });
  });
};

// Check if Python is installed
const checkPython = () => {
  return new Promise((resolve) => {
    const command = os.platform() === 'win32' ? 'python --version' : 'python3 --version';
    exec(command, (error) => {
      resolve(!error);
    });
  });
};

// Main build function
async function build() {
  try {
    console.log('Starting build process...');

    // Check Python installation
    const pythonInstalled = await checkPython();
    if (!pythonInstalled) {
      console.error('Python 3 is not installed. Please install Python 3.8 or higher.');
      process.exit(1);
    }

    // Install Python dependencies
    console.log('Installing Python dependencies...');
    const pythonExec = os.platform() === 'win32' ? 'python' : 'python3';
    await runCommand(pythonExec, ['-m', 'pip', 'install', '--no-cache-dir', '-r', 'requirements.txt']);

    // Install Node.js dependencies
    console.log('Installing Node.js dependencies...');
    await runCommand('npm', ['install']);

    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run the build
build();