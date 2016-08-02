angular
  .module('walletApp')
  .controller('BuyCtrl', BuyCtrl);

function BuyCtrl ($rootScope, $scope, $state, $filter, MyWallet, Wallet, Alerts, currency, $uibModalInstance, $uibModal, country, exchange, trades, fiat, trade, $timeout, bitcoinReceived, formatTrade) {
  $scope.settings = Wallet.settings;
  $scope.exchange = exchange && exchange.profile ? exchange : {profile: {}};
  $scope.btcCurrency = $scope.settings.btcCurrency;
  $scope.currencies = currency.coinifyCurrencies;
  $scope.countries = country;
  $scope.user = Wallet.user;
  $scope.trades = trades;
  $scope.alerts = [];
  $scope.status = {};
  $scope.trade = trade;
  $scope.step = 0;

  $scope.formattedTrade = undefined;
  $scope.bitcoinReceived = bitcoinReceived;

  $scope.fields = { email: $scope.user.email, countryCode: $scope.exchange.profile.country };
  $scope.bank = { name: 'bank', fee: 0 };
  $scope.card = { name: 'card', fee: 3 };
  $scope.method = $scope.card;
  $scope.transaction = {fiat: 0, btc: 0, fee: 0, total: 0, currency: $scope.settings.currency};
  $scope.transaction.fiat = fiat || 0;
  $scope.paymentInfo = undefined;

  $scope.countryCodeGuess = $scope.countries.countryCodes.filter(country => country.code === MyWallet.wallet.accountInfo.countryCodeGuess)[0];
  if ($scope.countryCodeGuess) $scope.fields.countryCode = $scope.countryCodeGuess.code;

  try {
    if (trades.pending.length || trades.completed.length) $scope.userHasExchangeAcct = true;
  } catch (e) {
    $scope.userHasExchangeAcct = false;
  }

  $scope.changeCurrency = (curr) => {
    if (!curr) curr = $scope.settings.currency;

    const error = () => {};
    const success = () => { $scope.transaction.currency = curr; };

    Wallet.changeCurrency(curr).then(success, error);
  };

  $scope.standardError = (err) => {
    console.log(err);
    $scope.status = {};
    try {
      let e = JSON.parse(err);
      let msg = e.error.toUpperCase();
      if (msg === 'EMAIL_ADDRESS_IN_USE') $scope.rejectedEmail = true;
      else Alerts.displayError(msg, true, $scope.alerts, {user: $scope.exchange.user});
    } catch (e) {
      let msg = e.error || err.message;
      if (msg) Alerts.displayError(msg, true, $scope.alerts);
      else Alerts.displayError('INVALID_REQUEST', true, $scope.alerts);
    }
  };

  $scope.fetchProfile = () => {
    const success = () => {};

    return $scope.exchange.fetchProfile().then(success, $scope.standardError);
  };

  $scope.updateAmounts = () => {
    if (!$scope.quote) return;
    if (!$scope.exchange && !$scope.exchange.user) return;
    let fiatAmt = $scope.transaction.fiat;
    let methodFee = fiatAmt * ($scope.method.fee / 100);

    $scope.transaction.methodFee = methodFee.toFixed(2);
    $scope.transaction.btc = currency.formatCurrencyForView($scope.quote.quoteAmount / 100, currency.bitCurrencies[0]);
    $scope.transaction.total = fiatAmt + +$scope.transaction.methodFee;
  };

  $scope.getQuote = () => {
    if (!$scope.exchange.user) return;

    $scope.transaction.btc = 0;
    $scope.quote = null;

    let amt = $scope.transaction.fiat;
    let curr = $scope.transaction.currency.code;
    if (!amt) return;
    $scope.status.waiting = true;

    const success = (quote) => {
      $scope.status = {};
      $scope.quote = quote;
      $scope.updateAmounts();
      Alerts.clear($scope.alerts);
    };

    $scope.exchange.getQuote(amt, curr).then(success, $scope.standardError);
  };

  $scope.toggleEmail = () => $scope.editEmail = !$scope.editEmail;
  $scope.isCurrencySelected = (currency) => currency === $scope.transaction.currency;

  $scope.addExchange = () => {
    if (!$scope.fields.countryCode) return;
    if (!MyWallet.wallet.external.coinify) MyWallet.wallet.external.addCoinify();
    $scope.exchange = MyWallet.wallet.external.coinify;
    $scope.partner = 'Coinify';
  };

  $scope.nextStep = () => {
    if (!$scope.transaction.fiat) {
      $scope.step = 0;
    } else if ((!$scope.fields.countryCode && !$scope.step > 0) || ($scope.step === 0 && !$scope.exchange.user)) {
      $scope.step = 1;
    } else if (!$scope.user.isEmailVerified) {
      $scope.step = 2;
    } else if ($scope.rejectedEmail) {
      $scope.step = 2;
    } else if (!$scope.exchange.user) {
      $scope.step = 3;
    } else if (!$scope.trade) {
      $scope.step = 4;
    } else if (!$scope.paymentInfo && !$scope.formattedTrade) {
      $scope.step = 5;
    } else if (!$scope.formattedTrade) {
      $scope.step = 6;
    } else if (!$scope.bitcoinReceived) {
      $scope.step = 7;
    } else {
      $scope.step = 8;
    }
  };

  $scope.prevStep = () => {
    if ($scope.status.waiting) return;

    if ($scope.exchange.user) {
      $scope.step = 0;
    } else if ($scope.step > 2) {
      $scope.step = 1;
    } else {
      $scope.step--;
    }
  };

  $scope.isDisabled = () => {
    if ($scope.step === 0) {
      return !($scope.transaction.fiat > 0);
    } else if ($scope.step === 1) {
      return !$scope.fields.countryCode;
    } else if ($scope.step === 3) {
      return !$scope.signupForm.$valid;
    }
  };

  $scope.changeEmail = (email, successCallback, errorCallback) => {
    $scope.rejectedEmail = undefined;

    const success = () => {
      Alerts.clear($scope.alerts);
      $scope.editEmail = false; successCallback();
    };
    const error = () => $scope.editEmail = false; errorCallback();

    Wallet.changeEmail(email, success, error);
  };

  $scope.signup = () => {
    $scope.status.waiting = true;

    const success = () => {
      Alerts.clear($scope.alerts);
      $scope.fetchProfile().then($scope.getQuote);
    };

    $scope.exchange.signup($scope.fields.countryCode)
      .then(success).catch($scope.standardError);
  };

  $scope.watchAddress = () => {
    if (!$scope.trade || $scope.bitcoinReceived) return;

    const success = () => {
      $timeout(() => {
        $scope.bitcoinReceived = true;
      });
    };

    $scope.trade.watchAddress().then(success);
  };

  $scope.buy = () => {
    $scope.status.waiting = true;

    let success = (trade) => {
      Alerts.clear($scope.alerts);
      $scope.trade = trade;
    };

    // check if bank transfer and kyc level
    if ($scope.method.name === 'bank' &&
        parseInt($scope.exchange.profile.level.name, 10) < 2) {
      $scope.exchange.triggerKYC().then(success, $scope.standardError);
      return;
    }

    // check if currency is supported by payment method first
    $scope.exchange.getPaymentMethods().then((methods) => {
      let curr = methods.filter(method => method.inMedium === $scope.method.name)[0].inCurrencies
                        .filter(curr => curr === $scope.transaction.currency.code);

      if (curr.length) {
        $scope.exchange.buy($scope.transaction.fiat, $scope.transaction.currency.code, $scope.method.name)
                       .then(success, $scope.standardError)
                       .then($scope.watchAddress);
      } else {
        $scope.status = {};
        Alerts.displayError('CURRENCY_NOT_SUPPORTED', false, $scope.alerts);
      }
    });
  };

  $scope.loadISX = () => {
    if ($scope.step === 5) return;
    $scope.status = {};
    $scope.nextStep();
  };

  $scope.declinedTx = (tx) => {
    $scope.formattedTrade = formatTrade.error(tx, $scope.trade, 'DECLINED_TRANSACTION');
  };

  $scope.failedTx = (tx) => {
    $scope.formattedTrade = formatTrade.error(tx, $scope.trade, 'FAILED_TRANSACTION');
  };

  $scope.expiredTx = (tx) => {
    $scope.formattedTrade = formatTrade.error(tx, $scope.trade, 'TX_EXPIRED');
  };

  $scope.successTx = (tx) => {
    $scope.formattedTrade = formatTrade.success($scope.trade);
  };

  $scope.reviewTx = (tx) => {
    $scope.formattedTrade = formatTrade.review(tx);
  };

  $scope.pendingTx = (tx) => {
    if (!tx) return;
    if ($scope.formattedTrade && $scope.formattedTrade.status === 'success') return;

    $scope.formattedTrade = formatTrade.pending(tx, $scope.trade);
  };

  $scope.cancel = () => {
    if ($scope.exchange.user) $scope.fetchTrades();
    if ($scope.status.waiting) return;
    $uibModalInstance.dismiss('');
    $scope.trade = null;
  };

  $scope.close = (acct) => {
    let text = ''; let action = '';
    if ($scope.step === 0) {
      text = 'CONFIRM_CLOSE_AMT'; action = 'CLOSE';
    } else if (!acct && $scope.step > 0) {
      text = 'CONFIRM_CLOSE_ACCT'; action = 'IM_DONE';
    } else if (acct) {
      text = 'CONFIRM_CLOSE'; action = 'IM_DONE';
    } else {
      text = 'CONFIRM_CANCEL'; action = 'IM_DONE';
    }

    Alerts.confirm(text, {action: action}).then($scope.cancel);
  };

  $scope.$watch('method', $scope.updateAmounts);
  $scope.$watch('transaction.fiat', $scope.getQuote);
  $scope.$watchGroup(['exchange.user', 'user.isEmailVerified', 'paymentInfo', 'formattedTrade'], $scope.nextStep);

  $scope.$watch('transaction.currency', () => {
    let curr = $scope.transaction.currency || null;
    $scope.currencySymbol = currency.conversions[curr.code];
    $scope.getQuote();
  });

  $scope.$watch('bitcoinReceived', (newVal) => {
    if (newVal) $scope.successTx();
  });

  $scope.$watch('step', (newVal) => {
    if (!$scope.partner) $scope.addExchange();
    if ($scope.exchange.user && !$scope.exchange.profile) $scope.fetchProfile();
  });

  if ($scope.trade && !bitcoinReceived) {
    $scope.nextStep();
    $scope.watchAddress();
  }

  $scope.fetchTrades = () => {
    $scope.userHasExchangeAcct = true;
    $rootScope.$broadcast('fetchTrades');
  };

  $scope.initBuy = () => {
    $uibModalInstance.dismiss('');
    $rootScope.$broadcast('initBuy');
  };
}