const ERROR_EMPTY = "Error: Partition cannot\nbe empty";
const ERROR_INTERVAL = "Error: Partition must\nhave support on the\ninterval [1,n]";
const ERROR_CROSSING = "Error: Partition must\nbe non-crossing";

//Annular-Disc Agnostic
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


//TODO: add additional case for the annular version
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

//takes in an array, returns the Kr complement of that array
//TODO: add optional parameter to detect annular case to change gamma_n to gamma_p,q
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