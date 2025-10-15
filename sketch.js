let SCREEN_WIDTH = 600;
let SCREEN_HEIGHT = 600;
let DISC_DIAMETER = 450;
const DOT_DIAMETER = 10;
const TEXT_OFFSET = 1.09;
const BEZI_SCALE = 0.7;
const M = 500; // Number of samples in the curve
const DISC_SIZE_RATIO = 0.75;
const AMPLITUDE = 4; // px
const WIGGLES = 4;
const WIG_SPEED = .35; //cycles per second
const ERROR_EMPTY = "Error: Partition cannot be empty";
const ERROR_INTERVAL = "Error: Partition must have support on the interval [1,n]";
const ERROR_CROSSING = "Error: Partition must be non-crossing";
let centreOfScreen;
let partField = null;
let submitButton = null;
let isTyping = false;
let pts = [], tans = [], norms = [], s = [];
let totalLen = 0;

let wiggleCheckbox = null;
let isWiggling = false;

let annularRadio; 



//these are all lists of vectors for drawing the beziers, the number positions and the dot positions
let startPos = [], endPos = [], controlOne = [], controlTwo = [], textPos = [], dotPos = []; 
//const ARC_COLOR = createVector(28, 82, 92);

function getCanvasTargetSize() {
  const size = Math.min(windowWidth, windowHeight);
  return size > 0 ? size : 600;
}
function applyCanvasMetrics(size) {
  SCREEN_WIDTH = size;
  SCREEN_HEIGHT = size;
  DISC_DIAMETER = SCREEN_WIDTH * DISC_SIZE_RATIO;
  centreOfScreen = createVector(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
}

function setup() {
  const canvasSize = getCanvasTargetSize();
  createCanvas(canvasSize, canvasSize);
  applyCanvasMetrics(canvasSize);
  angleMode(RADIANS);
  dotColor = createVector(28, 82, 92);

  // initialize the starting partition
  partition = "(1 4)(2 3)(5 7 8 12)(6)(9 10 11)"; // std-text
  partedArray = partitionToArr(partition); //std-list
  krewArr = getKrewerasComplement(partedArray); //kr-list
  krewStr = arrToString(krewArr); //kr-text

  textFont(myFont);
  isComplement = false;
  precomputeCurveData(partedArray);
  isValid = true;
  errorVal = "";

  wiggleCheckbox = createCheckbox(" Wiggle", isWiggling);
  wiggleCheckbox.changed(() => {
    isWiggling = wiggleCheckbox.checked();
  });
  wiggleCheckbox.style("font-size", "14px");
  wiggleCheckbox.style("font-family", 'Libertnius');
  wiggleCheckbox.style("color", "#333");
  const checkboxWidth = wiggleCheckbox.elt.offsetWidth || 0;
  wiggleCheckbox.position(
    SCREEN_WIDTH - checkboxWidth - 16,
    16
  );

  annularRadio = createRadio();
  annularRadio.position(0, 0); 
  annularRadio.size(1000);

  annularRadio.option('disc');
  annularRadio.option('annular');
  annularRadio.selected('disc');
}

function windowResized() {
  const canvasSize = getCanvasTargetSize();
  resizeCanvas(canvasSize, canvasSize);
  applyCanvasMetrics(canvasSize);
  if (partField !== null) {
    partField.position(SCREEN_WIDTH * (3 / 15), SCREEN_HEIGHT * 0.5);
    partField.size(SCREEN_WIDTH * (9 / 15));
  }
  if (submitButton !== null && partField !== null) {
    submitButton.position(
      SCREEN_WIDTH * (3 / 15) + partField.width + 10,
      SCREEN_HEIGHT * 0.5
    );
  }

  if(!isComplement) {
    precomputeCurveData(partedArray);
  }
  else { 
    precomputeCurveData(krewArr);
  }

  updateWiggleCheckboxPosition();
}

function updateWiggleCheckboxPosition() {
  if (wiggleCheckbox === null) {
    return;
  }
  const checkboxWidth = wiggleCheckbox.elt.offsetWidth || 0;
  wiggleCheckbox.position(
    SCREEN_WIDTH - checkboxWidth - 16,
    16
  );
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
      if(isComplement)
      {
        precomputeCurveData(krewArr);
      }else{
        precomputeCurveData(partedArray);
      }
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


//Based on the permutation, geenrate the geometry data for each curve of each cycle
//Called at start, when toggled between complement, and a new entry is inputted
function precomputeCurveData(arr) {
  //Reset array data to be now newly filled in
  startPos = [], endPos = [], controlOne = [], controlTwo = [], textPos = [], dotPos = []; 
  // Reset undulating wiggle data
  pts = [], norms = [], s =[];

  let angle = TWO_PI / arr.length;
  let angles = [];
  let s1 = [];
  for (let i = 0; i < arr.length; i++) {
    angles.push(HALF_PI - angle * i);
    s1.push(
      createVector(cos(angles[i]), sin(angles[i]))
    );
  }

  for (let j = 0; j < arr.length; j++) {
    let mapto = int(arr[j]) - 1;

    //Angles 
    let startAngle = angles[j];
    let endAngle = angles[mapto];
    let midAngle = (startAngle + endAngle) / 2;
    let q1Angle = (startAngle + endAngle) / 4;
    let q2Angle = (3 * (startAngle + endAngle)) / 4;

    //Positions on S1
    let startingPos = s1[j];
    let endingPos = s1[mapto];

    let offset = createVector(
      (DISC_DIAMETER / 2) * startingPos.x,
      (DISC_DIAMETER / 2) * startingPos.y
    );  

    let endOffset = createVector(
      (DISC_DIAMETER / 2) * endingPos.x,
      (DISC_DIAMETER / 2) * endingPos.y
    );


    //dot position data
    dotPos.push(createVector(centreOfScreen.x + offset.x, centreOfScreen.y - offset.y,));
    //text position data
    textPos.push(createVector(centreOfScreen.x + TEXT_OFFSET * offset.x,
       centreOfScreen.y - TEXT_OFFSET * offset.y));
    

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
    startPos.push(createVector(centreOfScreen.x + offset.x,
        centreOfScreen.y - offset.y));
    endPos.push(createVector(centreOfScreen.x + endOffset.x,
        centreOfScreen.y - endOffset.y))

    // TODO: actually change from a Bezier model to Jacobi elliptic function
    //  approximated by Hyperbolic functions
    //TODO: add conditional where the points are antipodal as it draws straight lines and not bends
    // In general this code is kind of wonky and there shouldn't be any conditionals, other than possibly the self-loop
    // based on which vertex is being mapped to which one, adjust the control Bezier location
    if (j < mapto || (j == arr.length-1 && mapto == 0)) { //TIGHTER-ASCENDING-CURVE
      controlOne.push(createVector(centreOfScreen.x + offset.x * BEZI_SCALE,
        centreOfScreen.y - offset.y * BEZI_SCALE));
      controlTwo.push(createVector(centreOfScreen.x + endOffset.x * BEZI_SCALE,
        centreOfScreen.y - endOffset.y * BEZI_SCALE));
    } else if (j > mapto) { //LONGER-RETURN-CURVE
      controlOne.push(createVector(centreOfScreen.x + offset.x * 0.45,
        centreOfScreen.y - offset.y * 0.45));
      controlTwo.push(createVector(centreOfScreen.x + endOffset.x * 0.45,
        centreOfScreen.y - endOffset.y * 0.45));
    } else if (j == mapto) { // SELF-LOOPS
      let leftAngle = HALF_PI - (j-0.5) * angle;
      let rightAngle = HALF_PI - (j+0.5) * angle;
      let leftControl = createVector(cos(leftAngle), sin(leftAngle));
      let rightControl = createVector(cos(rightAngle), sin(rightAngle));
      controlOne.push(createVector(centreOfScreen.x + leftControl.x * DISC_DIAMETER * 0.4,
        centreOfScreen.y - leftControl.y * DISC_DIAMETER * 0.4));
      controlTwo.push(createVector(centreOfScreen.x + rightControl.x * DISC_DIAMETER * 0.4,
        centreOfScreen.y - rightControl.y * DISC_DIAMETER * 0.4));
    }

    precomputeWiggles(j);
  }
}
// Takes in the index and the size of the array as this is only computed within preComputeCurveData()
function precomputeWiggles(ind) {
  let prePts = [], preNorms =[], preS = [];
  prePts.length = M, preNorms.length = M, preS.length = M;

  totalLen = 0;

  for (let i = 0; i < M; i++) {
    const t = i / (M-1);
    const x = bezierPoint(startPos[ind].x, controlOne[ind].x, controlTwo[ind].x, endPos[ind].x, t);
    const y = bezierPoint(startPos[ind].y, controlOne[ind].y, controlTwo[ind].y, endPos[ind].y, t);
    prePts[i] = createVector(x, y);

    const tx = bezierTangent(startPos[ind].x, controlOne[ind].x, controlTwo[ind].x, endPos[ind].x, t);
    const ty = bezierTangent(startPos[ind].x, controlOne[ind].x, controlTwo[ind].x, endPos[ind].x, t);
    const T = createVector(tx, ty);

    const n = createVector(-T.y, T.x);
    const nmag = n.mag();
    preNorms[i] = nmag > 0 ? n.div(nmag) : createVector(0,0);

    if (i === 0) {
      preS[i] = 0;
    } else {
      totalLen += p5.Vector.dist(prePts[i-1], prePts[i]);
      preS[i] = totalLen;
    }
  }
  //Stacks these lists into their parent 2d array
  pts.push(prePts);
  norms.push(preNorms);
  s.push(preS);
}

// Draws the disc and the cycles
function drawDisc() {
  //Draws the disc
  stroke(0);
  fill(255);
  strokeWeight(2); 
  circle(centreOfScreen.x, centreOfScreen.y, DISC_DIAMETER);
  strokeWeight(1);

  //Now for each j in [n]
  for (let j = 0; j < dotPos.length; j++) {
    //Draw the dot for j
    stroke(dotColor.x, dotColor.y, dotColor.z);
    fill(dotColor.x, dotColor.y, dotColor.z);
    circle(dotPos[j].x, dotPos[j].y, DOT_DIAMETER);

    // Text drawing
    textSize(13);
    textAlign(CENTER);
    text(`${j + 1}`, textPos[j].x, textPos[j].y);

    
    noFill(); //410, 20, 440, 300,

    if (!isWiggling){
      //base bezier
      bezier(startPos[j].x, startPos[j].y,
            controlOne[j].x, controlOne[j].y,
            controlTwo[j].x, controlTwo[j].y,
            endPos[j].x, endPos[j].y
      );
    } else {
      //Spatial frequency (radians per px) so 'wiggles' cycles span totalLen
      const k = (TWO_PI*WIGGLES) / (totalLen || 1); // trick to avoid division by zero
      const omega = TWO_PI * WIG_SPEED;
      const tSec = millis()/1000;

      //Undulating offset curves
      //stroke(25);
      stroke(dotColor.x, dotColor.y, dotColor.z);
      strokeWeight(1.4);
      noFill();
      beginShape();
      for (let i = 0; i < M; i++) {
        const phase = k * s[j][i] - omega * tSec;
        const off = AMPLITUDE * sin(phase);
        const vx = pts[j][i].x + norms[j][i].x * off;
        const vy = pts[j][i].y + norms[j][i].y * off;
        vertex(vx, vy);
      }
      endShape();
    }
    strokeWeight(1);


    
  }
}

//takes in an array, returns the Kr complement of that array
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

  // Step 2: Compute gamma_permutation (γ)
  let gamma_arr = new Array(n);
  for (let i = 0; i < n; i++) {
    gamma_arr[i] = ((i + 1) % n) + 1; // gam(i+1) = (i+1)%n + 1 (handles wrap-around)
  }

  let intermediate_arr = new Array(n);
  for (let k = 0; k < n; k++) {
    let gamma_of_k_plus_1 = gamma_arr[k];
    intermediate_arr[k] = pi_inverse_arr[gamma_of_k_plus_1 - 1];
  }
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
    //Reinstate partition
    partition = newPartition; // text partition
    partedArray = newPartedArray; // list partition
    //Store new Kreweras complement
    krewArr = getKrewerasComplement(partedArray); //list partition
    krewStr = arrToString(krewArr); // text partition

    isValid = true;
    errorVal = "";
    //Toggle back to the non Kr complement
    isComplement = false;
    //Precompute the Curve Data for the parted array
    precomputeCurveData(partedArray);
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

    //Hence is Valid and proceed to draw the disc, the dots, the text and the curves
    drawDisc();
    textSize(20);
    textAlign(LEFT);

    if (!isComplement) {
      //TODO: store regular stroke and fill values as a global constant at the top
      stroke(0);
      fill(0);
      text(`π = ${partition}`, SCREEN_WIDTH - textWidth(`π = ${partition}`) - 10, SCREEN_HEIGHT - 10);
    } else {
      //TODO: store Kreweras complement stroke and fill values as a globabl constant at the top
      stroke(219, 2, 49);
      fill(219, 2, 49 );
      // that weird red block is thin space which is smaller than regular space
      text(`Kr (π) = ${krewStr}`, SCREEN_WIDTH - textWidth(`Kr (π) = ${krewStr}`) - 10, SCREEN_HEIGHT - 10);
    } 
  
    if(isTyping)
    {
      drawTextbox();
    }
  }
}
