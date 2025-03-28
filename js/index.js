// Initialize first career
let careerNum = 0;

let $nextCareer = $('.career__nav--next');
let $prevCareer = $('.career__nav--prev');

// Click events for careers
$nextCareer.click(() => {
    if(careers[careerNum + 1]) {
        careerNum++;
        updateCareer();
    }
});

$prevCareer.click(() => {
    if(careers[careerNum - 1]) {
        careerNum--;
        updateCareer();
    }
});

// Updates career view
const updateCareer = function updateCareerInfo() {
    let $careerAbtSelector = $('.career__about');
    let $careerImgSelector = $('.career__img');

    let careerImg = careers[careerNum].img;
    let imgDisplay = careerImg ? '' : 'hidden';

    let careerAbtTemplate = `
            <div class="career__about__title">${careers[careerNum].company}</div>
            <div class="career__about__date">${careers[careerNum].date}</div>
            <div class="career__about__desc">${careers[careerNum].desc}</div>`;

    let careerImgTemplate = `<img src="${careerImg || ''}" alt="company logo" class="career__img__src ${imgDisplay}">`;

    $careerAbtSelector.animate({'opacity': 0}, 400, function(){
        $(this).html(careerAbtTemplate).animate({'opacity': 1}, 400);
    });

    $careerImgSelector.animate({'opacity': 0}, 400, function(){
        $(this).html(careerImgTemplate).animate({'opacity': 1}, 400);
    });

    if (careers[careerNum + 1]) {
        $nextCareer.addClass("career__nav--black");
        (new Image()).src = careers[careerNum+1].img;
    }
    else {
        $nextCareer.removeClass("career__nav--black");
    }

    careers[careerNum - 1] ?
        $prevCareer.addClass("career__nav--black") :
        $prevCareer.removeClass("career__nav--black");
};

window.onbeforeunload = () => {
    for(const form of document.getElementsByTagName('form')) {
        form.reset();
    }
}

updateCareer();