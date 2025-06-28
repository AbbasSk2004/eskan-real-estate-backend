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

console.log('Installing Python dependencies...');

// Check if Python is installed
const pythonExec = process.platform === 'win32' ? 'python' : 'python3';
const pythonProcess = spawn(pythonExec, ['--version']);

pythonProcess.on('error', (err) => {
  console.error('Error: Python is not installed or not in PATH');
  console.error('Please install Python 3.x and try again');
  process.exit(1);
});

pythonProcess.on('close', (code) => {
  if (code !== 0) {
    console.error('Error checking Python version');
    process.exit(1);
  }

  // Install dependencies using pip
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

    testProcess.stdout.on('data', (data) => {
      console.log('Test output:', data.toString());
    });

    testProcess.stderr.on('data', (data) => {
      console.error('Test error:', data.toString());
    });

    testProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Error testing recommendation engine');
        process.exit(1);
      }

      console.log('Recommendation engine is working correctly');
      console.log('Setup complete!');
    });
  });
});