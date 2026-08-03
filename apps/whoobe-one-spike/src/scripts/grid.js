"use strict";

// Fixed, not ported byte-for-byte: the source has `export default colSpans =
// {...}` with no declaring keyword (var/let/const) - under "use strict"
// (which this file itself opts into on line 1), assigning to an undeclared
// identifier throws ReferenceError at import time. Declaring it properly
// is the minimal fix; the data itself is unchanged.
const colSpans = {
    "1" : [ [1] ],
    "2" : [ [1 , 1] ],
    "3" : [ [1,1,1] , [1,2] , [2,1] ],
    "4" : [ [1,1,1,1], [2,2] , [1,3] , [1,1,2] , [1,2,1] , [ 2 , 1 , 1] , [ 3,1 ] ] ,
    "5" : [ [1,1,1,1,1],[1,1,1,2] , [1,1,3] , [1,4] , [1,1,2,1] , [1,2,1,1] , [ 1, 3 ,1] , [ 2,1,1,1] , [3,1,1] , [3,2] , [4,1] ],
    "6" : [ [1,1,1,1,1,1],[1,1,1,1,2] , [1,1,1,3] , [1,1,4] , [1,5] , [1,1,1,2,1] , [1,1,2,1,1] , [1,1,3,1] , [1,2,1,1,1] , [1,3,1,1] , [1,4,1] , [2,1,1,1,1] , [3,1,1,1] , [4,1,1] , [5,1] ],
}

export default colSpans
