const SCREEN_WIDTH = 600;
const SCREEN_HEIGHT = 600;
const DISC_DIAMETER = 450;
const DOT_DIAMETER = 10;
const TEXT_OFFSET = 1.09;
const BEZI_SCALE = 0.7;
const ERROR_EMPTY = "Error: Partition cannot be empty";
const ERROR_INTERVAL = "Error: Partition must have support on the interval [1,n]";
const ERROR_CROSSING = "Error: Partition must be non-crossing";
let centreOfScreen;
let partField = null;
let submitButton = null;
let isTyping = false;
//const ARC_COLOR = createVector(28, 82, 92);

function setup() {
  createCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
  angleMode(RADIANS);
  centreOfScreen = createVector(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
  dotColor = createVector(28, 82, 92);

  partition = "(1 4)(2 3)(5 7 8 12)(6)(9 10 11)";
  partedArray = partitionToArr(partition);
  textFont(myFont);
  isComplement = false;
  isValid = true;
  errorVal = "";
}

let myFont;
function preload() {
  myFont = loadFont("Libertnius.ttf");
}

function keyPressed() {
  // If SPACE is pressed toggle between the partition and its Kreweras complement
  if (key === " ") {
    if (!isTyping) {
      isComplement = !isComplement;
      print(isComplement);
    }
  }

  // If ENTER is pressed, toggle into input mode or submit if already typing
  if (keyCode === ENTER) {
    if (!isTyping) {
      isTyping = true;
      // create input UI immediately
      drawTextbox();
      print("Typing mode ON");
    } else {
      // If already typing, treat ENTER as submit
      updatePartition();
      print("Typing mode SUBMIT");
    }
  }
}

//Parse the partition STRING into an array
// e.g. (1 4)(2 3)(5 7 8 12)(6)(9 10 11) -> [4,3,1,2,7,6,8,12,10,11,9]
function partitionToArr(part) {
  let delimiter = "(";
  let partitionArray = part.split(delimiter);
  partitionArray.shift();
  let newArr = new Array(100).fill(undefined);
  for (i = 0; i < partitionArray.length; i++) {
    partitionArray[i] = partitionArray[i].slice(0, -1);
    subArr = partitionArray[i].split(" ");
    for (j = 0; j < subArr.length; j++) {
      if (j < subArr.length - 1) {
        newArr[subArr[j]] = int(subArr[j + 1]);
      } else {
        newArr[subArr[j]] = int(subArr[0]);
      }
    }
  }
  newArr = newArr.filter((value) => value != null);
  print(newArr);
  return newArr;
}

//TODO: making multiple passes over the array is inefficient
// but n is small so it doesn't matter
// Check if the partition is valid:
// 1. non-empty
// 2. values in [1,n]
// 3. non-crossing
// 4. all values in [1,n] are present
function isValidPartition(arr) {
  let n = arr.length;
  if (n == 0) {
    errorVal = ERROR_EMPTY;
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (arr[i] < 1 || arr[i] > n) {
      errorVal = ERROR_INTERVAL;
      return false;
    }
  }
  // Check for non-crossing condition
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let a = i + 1;
      let b = arr[i];
      let c = j + 1;
      let d = arr[j];
      if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) {
        errorVal = ERROR_CROSSING;
        return false;
      }
    }
  }
  //check if all values in [1,n] are present
  let valueSet = new Set(arr);
  for (let k = 1; k <= n; k++) {
    if (!valueSet.has(k)) {
      errorVal = ERROR_INTERVAL;
      return false;
    }
  }
  return true;
}

function drawDisc(arr) {
  stroke(0);
  fill(255);
  circle(centreOfScreen.x, centreOfScreen.y, DISC_DIAMETER);
  n = arr.length;
  let angle = TWO_PI / n;

  //Maybe here we push the angles and mapping angles?
  angles = [];
  for (let i = 0; i < n; i++) {
    angles.push(
      createVector(cos(HALF_PI - angle * i), sin(HALF_PI - angle * i))
    );
  }

  for (let j = 0; j < n; j++) {
    mapto = int(arr[j]) - 1;
    startAngle = angles[j];
    endAngle = angles[mapto];
    midAngle = (startAngle + endAngle) / 2;
    q1Angle = (startAngle + endAngle) / 4;
    q2Angle = (3 * (startAngle + endAngle)) / 4;

    let offset = createVector(
      (DISC_DIAMETER / 2) * startAngle.x,
      (DISC_DIAMETER / 2) * startAngle.y
    );

    stroke(dotColor.x, dotColor.y, dotColor.z);
    fill(dotColor.x, dotColor.y, dotColor.z);
    circle(
      centreOfScreen.x + offset.x,
      centreOfScreen.y - offset.y,
      DOT_DIAMETER
    );
    textSize(13);
    text(
      `${j + 1}`,
      centreOfScreen.x + TEXT_OFFSET * offset.x,
      centreOfScreen.y - TEXT_OFFSET * offset.y
    );

    let endOffset = createVector(
      (DISC_DIAMETER / 2) * endAngle.x,
      (DISC_DIAMETER / 2) * endAngle.y
    );

    // let midOffset = createVector(
    //   DISC_DIAMETER * midAngle.x / 2,
    //   DISC_DIAMETER * midAngle.y/ 2
    // );

    //     let q1Offset = createVector(
    //       DISC_DIAMETER * q1Angle.x / 6,
    //       DISC_DIAMETER * q1Angle.y / 6
    //     );

    //     let q2Offset = createVector(
    //       DISC_DIAMETER * q2Angle.x/6,
    //       DISC_DIAMETER * q2Angle.y/6
    //     );
    noFill(); //410, 20, 440, 300,

    if (j < mapto) {
      bezier(
        centreOfScreen.x + offset.x,
        centreOfScreen.y - offset.y,
        centreOfScreen.x + offset.x * BEZI_SCALE,
        centreOfScreen.y - offset.y * BEZI_SCALE,
        centreOfScreen.x + endOffset.x * BEZI_SCALE,
        centreOfScreen.y - endOffset.y * BEZI_SCALE,
        centreOfScreen.x + endOffset.x,
        centreOfScreen.y - endOffset.y
      );
    } else if (j > mapto) {
      bezier(
        centreOfScreen.x + offset.x,
        centreOfScreen.y - offset.y,
        centreOfScreen.x + offset.x * 0.45,
        centreOfScreen.y - offset.y * 0.45,
        centreOfScreen.x + endOffset.x * 0.45,
        centreOfScreen.y - endOffset.y * 0.45,
        centreOfScreen.x + endOffset.x,
        centreOfScreen.y - endOffset.y
      );
    } else if (j == mapto) {
      let leftAngle = HALF_PI - (j-0.5) * angle;
      let rightAngle = HALF_PI - (j+0.5) * angle;
      let leftControl = createVector(cos(leftAngle), sin(leftAngle));
      let rightControl = createVector(cos(rightAngle), sin(rightAngle));
      bezier(
        centreOfScreen.x + offset.x,
        centreOfScreen.y - offset.y,
        centreOfScreen.x + leftControl.x * DISC_DIAMETER * 0.4,
        centreOfScreen.y - leftControl.y * DISC_DIAMETER * 0.4,
        centreOfScreen.x + rightControl.x * DISC_DIAMETER * 0.4,
        centreOfScreen.y - rightControl.y * DISC_DIAMETER * 0.4,
        centreOfScreen.x + endOffset.x,
        centreOfScreen.y - endOffset.y
      );
    }

    // bezier(
    //   centreOfScreen.x + offset.x,
    //   centreOfScreen.y - offset.y,
    //   centreOfScreen.x + BEZI_SCALE*q1Offset.x,
    //   centreOfScreen.y - BEZI_SCALE*q1Offset.y,
    //   centreOfScreen.x + BEZI_SCALE*q2Offset.x,
    //   centreOfScreen.y - BEZI_SCALE*q2Offset.y,
    //   centreOfScreen.x + endOffset.x,
    //   centreOfScreen.y - endOffset.y
    // );
  }
  //print(arr[0]);
  //print(int(arr[0])-1);
  //print(angles[int(arr[0])-1]);
  //print(angles[int(arr[0])-1].x);
  //print(angles[int(arr[0])-1].y);
}

function getKrewerasComplement(pi_arr) {
  let n = pi_arr.length;

  // Step 1: Compute pi_inverse (π⁻¹)
  // pi_inverse[j-1] will store the value i such that pi(i) = j
  let pi_inverse_arr = new Array(n);
  for (let i = 0; i < n; i++) {
    // If pi_arr[i] is the image of (i+1) under pi,
    // then (i+1) is the image of pi_arr[i] under pi_inverse.
    pi_inverse_arr[pi_arr[i] - 1] = i + 1;
  }
  //console.log("pi_inverse:", pi_inverse_arr); // Debugging

  // Step 2: Compute gamma_permutation (γ)
  // This is the cyclic permutation (1 2 ... n)
  // gamma_permutation[i-1] will store γ(i)
  let gamma_arr = new Array(n);
  for (let i = 0; i < n; i++) {
    gamma_arr[i] = ((i + 1) % n) + 1; // γ(i+1) = (i+1)%n + 1 (handles wrap-around)
  }

  let intermediate_arr = new Array(n);
  for (let k = 0; k < n; k++) {
    let gamma_of_k_plus_1 = gamma_arr[k];
    intermediate_arr[k] = pi_inverse_arr[gamma_of_k_plus_1 - 1];
  }
  console.log("gamma_circ_pi_inverse:", intermediate_arr); // Debugging

  return intermediate_arr;
}

function drawTextbox(){
  // Only create the input and button once when entering typing mode
  if (partField !== null) {
    // already created
    return;
  }

  // draw instruction text
  textSize(20);
  fill(0);
  noStroke();
  text("Please enter the partition below (e.g. (1 4)(2 3)):", SCREEN_WIDTH/9, SCREEN_HEIGHT*(5/14));

  // create input field
  partField = createInput();
  partField.attribute('placeholder', 'enter partition, e.g. (1 4)(2 3)');
  partField.position(SCREEN_WIDTH*(3/15), SCREEN_HEIGHT*(0.5));
  partField.size(SCREEN_WIDTH*(9/15));
  partField.style('font-size', '18px');
  partField.style('padding', '6px');
  partField.style('border', '2px solid #000');
  partField.style('border-radius', '4px');
  partField.style('box-shadow', '1px 1px 3px rgba(0,0,0,0.3)');
  partField.style('outline', 'none');
  partField.style('background-color', '#fff');
  partField.style('color', '#000');
  partField.style('text-align', 'center');
  partField.style('font-family', 'Libertinius, sans-serif');
  partField.style('font-weight', 'bold');
  partField.style('z-index', '10');

  // Focus so user can start typing immediately
  partField.elt.focus();

  // submit on change (e.g. Enter inside input) or via button
  partField.changed(updatePartition);

  // create submit button
  submitButton = createButton('Submit');
  submitButton.position(SCREEN_WIDTH*(3/15) + partField.width + 10, SCREEN_HEIGHT*(0.5));
  submitButton.mousePressed(updatePartition);
  submitButton.style('font-size', '16px');
  submitButton.style('padding', '6px 10px');
  submitButton.style('z-index', '10');
}

function updatePartition(){
  // If the UI doesn't exist, nothing to do
  if (partField === null && submitButton === null) {
    isTyping = false;
    return;
  }

  // Read value (if any)
  let newPartition = "";
  if (partField !== null) {
    newPartition = partField.value().trim();
  }

  // Remove UI elements
  if (partField !== null) {
    partField.remove();
    partField = null;
  }
  if (submitButton !== null) {
    submitButton.remove();
    submitButton = null;
  }

  isTyping = false;

  if (newPartition.length === 0) {
    // If user submitted empty string, keep previous partition (or you could clear)
    isValid = false;
    errorVal = ERROR_EMPTY;
    return;
  }

  let newPartedArray = partitionToArr(newPartition);
  if (isValidPartition(newPartedArray)) {
    partition = newPartition;
    partedArray = newPartedArray;
    isValid = true;
    errorVal = "";
  } else {
    isValid = false;
    // partedArray remains unchanged
  }
}

function arrToString(arr) {
  let n = arr.length;
  let visited = new Array(n).fill(false);
  let result = "";

  for (let i = 0; i < n; i++) {
    if (!visited[i]) {
      let cycle = [];
      let current = i + 1; // Convert to 1-based index
      do {
        cycle.push(current);
        visited[current - 1] = true; // Mark as visited
        current = arr[current - 1]; // Move to the next element in the cycle
      } while (current !== i + 1);
      result += "(" + cycle.join(" ") + ")";
    }
  }
  return result;
}

function draw() {
  background(220);
  strokeWeight(1);
  if(!isValid){
    fill(255,0,0);
    textSize(30);
    text("Invalid Partition", SCREEN_WIDTH/2 - textWidth("Invalid Partition")/2, SCREEN_HEIGHT/2);
    text(errorVal, SCREEN_WIDTH/2 - textWidth(errorVal)/2, SCREEN_HEIGHT/2 + 25);
  } else {
    if (!isComplement) {
    drawDisc(partedArray);
    textSize(20);
    stroke(0);
    fill(0);
    text(`π = ${partition}`, SCREEN_WIDTH - textWidth(`π = ${partition}`) - 10, SCREEN_HEIGHT - 10);
  } else 
    {
    let krewArr = getKrewerasComplement(partedArray);
    drawDisc(krewArr);
    let krewStr = arrToString(krewArr);
    textSize(20);
    stroke(225, 10, 30);
    fill(255,10,30 );
    text(`Kr(π) = ${krewStr}`, SCREEN_WIDTH - textWidth(`Kr(π) = ${krewStr}`) - 10, SCREEN_HEIGHT - 10);
    }
  
    if(isTyping)
    {
      drawTextbox();
    }
  }
}
