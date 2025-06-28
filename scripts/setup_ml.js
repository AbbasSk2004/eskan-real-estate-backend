const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to requirements.txt
const requirementsPath = path.join(__dirname, '..', 'requirements.txt');

// Check if requirements.txt exists
if (!fs.existsSync(requirementsPath)) {
  console.error('Error: requirements.txt not found');
  process.exit(1);
}

console.log('Setting up ML recommendation engine...');

// Determine Python command based on platform
const pythonExec = process.platform === 'win32' ? 'python' : 'python3';
console.log(`Using Python command: ${pythonExec}`);

// Check if Python is installed and get version
console.log('Checking Python installation...');
const pythonProcess = spawn(pythonExec, ['--version']);

let pythonVersion = '';
pythonProcess.stdout.on('data', (data) => {
  pythonVersion += data.toString();
});

pythonProcess.stderr.on('data', (data) => {
  pythonVersion += data.toString();
});

pythonProcess.on('error', (err) => {
  console.error('Error: Python is not installed or not in PATH');
  console.error('Please install Python 3.x and try again');
  console.error(`Attempted to run: ${pythonExec} --version`);
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

pythonProcess.on('close', (code) => {
  if (code !== 0) {
    console.error('Error checking Python version');
    process.exit(1);
  }

  console.log(`Detected Python: ${pythonVersion.trim()}`);
  
  // Check if it's Python 3
  if (!pythonVersion.includes('Python 3')) {
    console.error('Error: Python 3.x is required for the ML recommendation engine');
    console.error(`Detected: ${pythonVersion.trim()}`);
    console.error('Please install Python 3.x and try again');
    process.exit(1);
  }

  // Install dependencies using pip
  console.log('Installing Python dependencies...');
  const pipProcess = spawn(pythonExec, ['-m', 'pip', 'install', '-r', requirementsPath]);

  pipProcess.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  pipProcess.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  pipProcess.on('error', (err) => {
    console.error('Error: pip is not installed or not in PATH');
    console.error('Please install pip and try again');
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  pipProcess.on('close', (code) => {
    if (code !== 0) {
      console.error('Error installing Python dependencies');
      process.exit(1);
    }

    console.log('Python dependencies installed successfully');
    
    // Test the recommendation engine
    console.log('Testing recommendation engine...');
    
    const testProcess = spawn(pythonExec, [
      path.join(__dirname, 'recommendation_engine.py'),
      JSON.stringify({
        mode: 'test',
        test_data: {
          property_id: 'test',
          all_properties: [
            {
              id: 'test',
              property_type: 'Apartment',
              price: 100000,
              area: 100,
              bedrooms: 2,
              bathrooms: 1,
              governate: 'Test',
              city: 'Test',
              created_at: new Date().toISOString(),
              is_featured: false
            }
          ]
        }
      })
    ]);

    let testOutput = '';
    let testError = '';

    testProcess.stdout.on('data', (data) => {
      testOutput += data.toString();
      console.log('Test output:', data.toString());
    });

    testProcess.stderr.on('data', (data) => {
      testError += data.toString();
      console.error('Test error:', data.toString());
    });

    testProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Error testing recommendation engine');
        console.error('The ML recommendation engine failed to run properly');
        console.error('The system will fall back to JavaScript recommendations');
        console.error(`Error details: ${testError}`);
        process.exit(1);
      }

      try {
        // Try to parse the output to ensure it's valid JSON
        const result = JSON.parse(testOutput);
        if (result.success) {
          console.log('✅ ML recommendation engine is working correctly');
          console.log('✅ Setup complete!');
        } else {
          console.error('❌ ML recommendation engine returned an error');
          console.error('The system will fall back to JavaScript recommendations');
          console.error(`Error details: ${JSON.stringify(result.error)}`);
          process.exit(1);
        }
      } catch (err) {
        console.error('❌ Failed to parse ML engine output');
        console.error('The system will fall back to JavaScript recommendations');
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
  });
});